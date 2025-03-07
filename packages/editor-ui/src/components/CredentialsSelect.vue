<template>
	<div>
		<div :class="$style['parameter-value-container']">
			<n8n-select
				:size="inputSize"
				filterable
				:value="displayValue"
				:placeholder="
					parameter.placeholder ? getPlaceholder() : $locale.baseText('parameterInput.select')
				"
				:title="displayTitle"
				:disabled="isReadOnly"
				ref="innerSelect"
				@change="(value) => $emit('valueChanged', value)"
				@keydown.stop
				@focus="$emit('setFocus')"
				@blur="$emit('onBlur')"
				data-test-id="credential-select"
			>
				<n8n-option
					v-for="credType in supportedCredentialTypes"
					:value="credType.name"
					:key="credType.name"
					:label="credType.displayName"
					data-test-id="credential-select-option"
				>
					<div class="list-option">
						<div class="option-headline">
							{{ credType.displayName }}
						</div>
						<div
							v-if="credType.description"
							class="option-description"
							v-html="credType.description"
						/>
					</div>
				</n8n-option>
			</n8n-select>
			<slot name="issues-and-options" />
		</div>

		<scopes-notice
			v-if="scopes.length > 0"
			:activeCredentialType="activeCredentialType"
			:scopes="scopes"
		/>
		<div>
			<node-credentials
				:node="node"
				:overrideCredType="node.parameters[parameter.name]"
				@credentialSelected="(updateInformation) => $emit('credentialSelected', updateInformation)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import { ICredentialType } from 'n8n-workflow';
import Vue from 'vue';
import ScopesNotice from '@/components/ScopesNotice.vue';
import NodeCredentials from '@/components/NodeCredentials.vue';
import { mapStores } from 'pinia';
import { useCredentialsStore } from '@/stores/credentials';
import { N8nSelect } from 'n8n-design-system';

type N8nSelectRef = InstanceType<typeof N8nSelect>;

export default Vue.extend({
	name: 'CredentialsSelect',
	components: {
		ScopesNotice,
		NodeCredentials,
	},
	props: [
		'activeCredentialType',
		'node',
		'parameter',
		'inputSize',
		'displayValue',
		'isReadOnly',
		'displayTitle',
	],
	computed: {
		...mapStores(useCredentialsStore),
		allCredentialTypes(): ICredentialType[] {
			return this.credentialsStore.allCredentialTypes;
		},
		scopes(): string[] {
			if (!this.activeCredentialType) return [];

			return this.credentialsStore.getScopesByCredentialType(this.activeCredentialType);
		},
		supportedCredentialTypes(): ICredentialType[] {
			return this.allCredentialTypes.filter((c: ICredentialType) => this.isSupported(c.name));
		},
	},
	methods: {
		focus() {
			const selectRef = this.$refs.innerSelect as N8nSelectRef | undefined;
			if (selectRef) {
				selectRef.focus();
			}
		},
		/**
		 * Check if a credential type belongs to one of the supported sets defined
		 * in the `credentialTypes` key in a `credentialsSelect` parameter
		 */
		isSupported(name: string): boolean {
			const supported = this.getSupportedSets(this.parameter.credentialTypes);

			const checkedCredType = this.credentialsStore.getCredentialTypeByName(name);

			for (const property of supported.has) {
				if (checkedCredType[property as keyof ICredentialType] !== undefined) {
					// edge case: `httpHeaderAuth` has `authenticate` auth but belongs to generic auth
					if (name === 'httpHeaderAuth' && property === 'authenticate') continue;

					return true;
				}
			}

			if (
				checkedCredType.extends &&
				checkedCredType.extends.some((parentType: string) => supported.extends.includes(parentType))
			) {
				return true;
			}

			if (checkedCredType.extends && supported.extends.length) {
				// recurse upward until base credential type
				// e.g. microsoftDynamicsOAuth2Api -> microsoftOAuth2Api -> oAuth2Api
				return checkedCredType.extends.reduce(
					(acc: boolean, parentType: string) => acc || this.isSupported(parentType),
					false,
				);
			}

			return false;
		},
		getSupportedSets(credentialTypes: string[]) {
			return credentialTypes.reduce<{ extends: string[]; has: string[] }>(
				(acc, cur) => {
					const _extends = cur.split('extends:');

					if (_extends.length === 2) {
						acc.extends.push(_extends[1]);
						return acc;
					}

					const _has = cur.split('has:');

					if (_has.length === 2) {
						acc.has.push(_has[1]);
						return acc;
					}

					return acc;
				},
				{ extends: [], has: [] },
			);
		},
	},
});
</script>

<style module lang="scss">
.parameter-value-container {
	display: flex;
	align-items: center;
}
</style>
