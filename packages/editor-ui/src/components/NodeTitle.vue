<template>
	<span :class="$style.container" data-test-id="node-title-container" @click="onEdit">
		<span :class="$style.iconWrapper"><NodeIcon :nodeType="nodeType" :size="18" /></span>
		<n8n-popover placement="right" width="200" :value="editName" :disabled="!editable">
			<div
				:class="$style.editContainer"
				@keydown.enter="onRename"
				@keydown.stop
				@keydown.esc="editName = false"
			>
				<n8n-text :bold="true" color="text-base" tag="div">{{
					$locale.baseText('ndv.title.renameNode')
				}}</n8n-text>
				<n8n-input ref="input" size="small" v-model="newName" data-test-id="node-rename-input" />
				<div :class="$style.editButtons">
					<n8n-button
						type="secondary"
						size="small"
						@click="editName = false"
						:label="$locale.baseText('ndv.title.cancel')"
					/>
					<n8n-button
						type="primary"
						size="small"
						@click="onRename"
						:label="$locale.baseText('ndv.title.rename')"
					/>
				</div>
			</div>
			<template #reference>
				<div class="ph-no-capture" :class="{ [$style.title]: true, [$style.hoverable]: editable }">
					{{ value }}
					<div :class="$style.editIconContainer">
						<font-awesome-icon :class="$style.editIcon" icon="pencil-alt" v-if="editable" />
					</div>
				</div>
			</template>
		</n8n-popover>
	</span>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
	name: 'NodeTitle',
	props: {
		value: {
			type: String,
		},
		nodeType: {},
		readOnly: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		return {
			editName: false,
			newName: '',
		};
	},
	computed: {
		editable(): boolean {
			return !this.readOnly && window === window.parent;
		},
	},
	methods: {
		onEdit() {
			this.newName = this.value;
			this.editName = true;
			this.$nextTick(() => {
				const inputRef = this.$refs.input as HTMLInputElement | undefined;
				if (inputRef) {
					inputRef.focus();
				}
			});
		},
		onRename() {
			if (this.newName.trim() !== '') {
				this.$emit('input', this.newName.trim());
			}

			this.editName = false;
		},
	},
});
</script>

<style lang="scss" module>
.container {
	font-weight: var(--font-weight-bold);
	display: flex;
	font-size: var(--font-size-m);
	line-height: var(--font-line-height-compact);
	overflow-wrap: anywhere;
	padding-right: var(--spacing-s);
	overflow: hidden;
}

.title {
	max-height: 100px;
	display: -webkit-box;
	-webkit-line-clamp: 5;
	-webkit-box-orient: vertical;
	color: var(--color-text-dark);
}

.hoverable {
	&:hover {
		cursor: pointer;
		.editIcon {
			display: inline-block;
		}
	}
}

.iconWrapper {
	display: inline-flex;
	margin-right: var(--spacing-2xs);
}

.editIcon {
	display: none;
	font-size: var(--font-size-xs);
	color: var(--color-text-base);
	position: absolute;
	bottom: 0;
}

.editIconContainer {
	display: inline-block;
	position: relative;
	width: 0;
}

.editButtons {
	text-align: right;
	margin-top: var(--spacing-s);

	> * {
		margin-left: var(--spacing-4xs);
	}
}

.editContainer {
	text-align: left;

	> *:first-child {
		margin-bottom: var(--spacing-4xs);
	}
}
</style>
