import { IExecutionPushResponse, IExecutionResponse, IStartRunData } from '@/Interface';

import {
	IRunData,
	IRunExecutionData,
	IWorkflowBase,
	NodeHelpers,
	TelemetryHelpers,
} from 'n8n-workflow';

import { externalHooks } from '@/mixins/externalHooks';
import { restApi } from '@/mixins/restApi';
import { workflowHelpers } from '@/mixins/workflowHelpers';
import { showMessage } from '@/mixins/showMessage';

import mixins from 'vue-typed-mixins';
import { useTitleChange } from '@/composables/useTitleChange';
import { mapStores } from 'pinia';
import { useUIStore } from '@/stores/ui';
import { useWorkflowsStore } from '@/stores/workflows';
import { useRootStore } from '@/stores/n8nRootStore';

export const workflowRun = mixins(externalHooks, restApi, workflowHelpers, showMessage).extend({
	setup() {
		return {
			...useTitleChange(),
		};
	},
	computed: {
		...mapStores(useRootStore, useUIStore, useWorkflowsStore),
	},
	methods: {
		// Starts to executes a workflow on server.
		async runWorkflowApi(runData: IStartRunData): Promise<IExecutionPushResponse> {
			if (this.rootStore.pushConnectionActive === false) {
				// Do not start if the connection to server is not active
				// because then it can not receive the data as it executes.
				throw new Error(this.$locale.baseText('workflowRun.noActiveConnectionToTheServer'));
			}

			this.workflowsStore.subWorkflowExecutionError = null;

			this.uiStore.addActiveAction('workflowRunning');

			let response: IExecutionPushResponse;

			try {
				response = await this.restApi().runWorkflow(runData);
			} catch (error) {
				this.uiStore.removeActiveAction('workflowRunning');
				throw error;
			}

			if (response.executionId !== undefined) {
				this.workflowsStore.activeExecutionId = response.executionId;
			}

			if (response.waitingForWebhook === true) {
				this.workflowsStore.executionWaitingForWebhook = true;
			}

			return response;
		},
		async runWorkflow(
			nodeName?: string,
			source?: string,
		): Promise<IExecutionPushResponse | undefined> {
			const workflow = this.getCurrentWorkflow();

			if (this.uiStore.isActionActive('workflowRunning')) {
				return;
			}

			this.titleSet(workflow.name as string, 'EXECUTING');

			this.clearAllStickyNotifications();

			try {
				// Check first if the workflow has any issues before execute it
				const issuesExist = this.workflowsStore.nodesIssuesExist;
				if (issuesExist === true) {
					// If issues exist get all of the issues of all nodes
					const workflowIssues = this.checkReadyForExecution(workflow, nodeName);
					if (workflowIssues !== null) {
						const errorMessages = [];
						let nodeIssues: string[];
						const trackNodeIssues: Array<{
							node_type: string;
							error: string;
						}> = [];
						const trackErrorNodeTypes: string[] = [];
						for (const nodeName of Object.keys(workflowIssues)) {
							nodeIssues = NodeHelpers.nodeIssuesToString(workflowIssues[nodeName]);
							let issueNodeType = 'UNKNOWN';
							const issueNode = this.workflowsStore.getNodeByName(nodeName);

							if (issueNode) {
								issueNodeType = issueNode.type;
							}

							trackErrorNodeTypes.push(issueNodeType);
							const trackNodeIssue = {
								node_type: issueNodeType,
								error: '',
								caused_by_credential: !!workflowIssues[nodeName].credentials,
							};

							for (const nodeIssue of nodeIssues) {
								errorMessages.push(`<strong>${nodeName}</strong>: ${nodeIssue}`);
								trackNodeIssue.error = trackNodeIssue.error.concat(', ', nodeIssue);
							}
							trackNodeIssues.push(trackNodeIssue);
						}

						this.$showMessage({
							title: this.$locale.baseText('workflowRun.showMessage.title'),
							message: errorMessages.join('<br />'),
							type: 'error',
							duration: 0,
						});
						this.titleSet(workflow.name as string, 'ERROR');
						this.$externalHooks().run('workflowRun.runError', { errorMessages, nodeName });

						this.getWorkflowDataToSave().then((workflowData) => {
							this.$telemetry.track('Workflow execution preflight failed', {
								workflow_id: workflow.id,
								workflow_name: workflow.name,
								execution_type: nodeName ? 'node' : 'workflow',
								node_graph_string: JSON.stringify(
									TelemetryHelpers.generateNodesGraph(
										workflowData as IWorkflowBase,
										this.getNodeTypes(),
									).nodeGraph,
								),
								error_node_types: JSON.stringify(trackErrorNodeTypes),
								errors: JSON.stringify(trackNodeIssues),
							});
						});
						return;
					}
				}

				// Get the direct parents of the node
				let directParentNodes: string[] = [];
				if (nodeName !== undefined) {
					directParentNodes = workflow.getParentNodes(nodeName, 'main', 1);
				}

				const runData = this.workflowsStore.getWorkflowRunData;

				let newRunData: IRunData | undefined;

				const startNodes: string[] = [];

				if (runData !== null && Object.keys(runData).length !== 0) {
					newRunData = {};

					// Go over the direct parents of the node
					for (const directParentNode of directParentNodes) {
						// Go over the parents of that node so that we can get a start
						// node for each of the branches
						const parentNodes = workflow.getParentNodes(directParentNode, 'main');

						// Add also the enabled direct parent to be checked
						if (workflow.nodes[directParentNode].disabled) continue;

						parentNodes.push(directParentNode);

						for (const parentNode of parentNodes) {
							if (runData[parentNode] === undefined || runData[parentNode].length === 0) {
								// When we hit a node which has no data we stop and set it
								// as a start node the execution from and then go on with other
								// direct input nodes
								startNodes.push(parentNode);
								break;
							}
							newRunData[parentNode] = runData[parentNode].slice(0, 1);
						}
					}

					if (Object.keys(newRunData).length === 0) {
						// If there is no data for any of the parent nodes make sure
						// that run data is empty that it runs regularly
						newRunData = undefined;
					}
				}

				if (startNodes.length === 0 && nodeName !== undefined) {
					startNodes.push(nodeName);
				}

				const isNewWorkflow = this.workflowsStore.isNewWorkflow;
				const hasWebhookNode = this.workflowsStore.currentWorkflowHasWebhookNode;
				if (isNewWorkflow && hasWebhookNode) {
					await this.saveCurrentWorkflow();
				}

				const workflowData = await this.getWorkflowDataToSave();

				const startRunData: IStartRunData = {
					workflowData,
					runData: newRunData,
					pinData: workflowData.pinData,
					startNodes,
				};
				if (nodeName) {
					startRunData.destinationNode = nodeName;
				}

				// Init the execution data to represent the start of the execution
				// that data which gets reused is already set and data of newly executed
				// nodes can be added as it gets pushed in
				const executionData: IExecutionResponse = {
					id: '__IN_PROGRESS__',
					finished: false,
					mode: 'manual',
					startedAt: new Date(),
					stoppedAt: undefined,
					workflowId: workflow.id,
					executedNode: nodeName,
					data: {
						resultData: {
							runData: newRunData || {},
							pinData: workflowData.pinData,
							startNodes,
							workflowData,
						},
					} as IRunExecutionData,
					workflowData: {
						id: this.workflowsStore.workflowId,
						name: workflowData.name!,
						active: workflowData.active!,
						createdAt: 0,
						updatedAt: 0,
						...workflowData,
					},
				};
				this.workflowsStore.setWorkflowExecutionData(executionData);
				this.updateNodesExecutionIssues();

				const runWorkflowApiResponse = await this.runWorkflowApi(startRunData);

				this.$externalHooks().run('workflowRun.runWorkflow', { nodeName, source });

				return runWorkflowApiResponse;
			} catch (error) {
				this.titleSet(workflow.name as string, 'ERROR');
				this.$showError(error, this.$locale.baseText('workflowRun.showError.title'));
				return undefined;
			}
		},
	},
});
