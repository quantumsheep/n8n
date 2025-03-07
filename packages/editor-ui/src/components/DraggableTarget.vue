<template>
	<div ref="target">
		<slot :droppable="droppable" :activeDrop="activeDrop"></slot>
	</div>
</template>

<script lang="ts">
import { useNDVStore } from '@/stores/ndv';
import { mapStores } from 'pinia';
import Vue, { PropType } from 'vue';

export default Vue.extend({
	props: {
		type: {
			type: String,
		},
		disabled: {
			type: Boolean,
		},
		sticky: {
			type: Boolean,
		},
		stickyOffset: {
			type: Array as PropType<number[]>,
			default: () => [0, 0],
		},
	},
	data() {
		return {
			hovering: false,
		};
	},
	mounted() {
		window.addEventListener('mousemove', this.onMouseMove);
		window.addEventListener('mouseup', this.onMouseUp);
	},
	destroyed() {
		window.removeEventListener('mousemove', this.onMouseMove);
		window.removeEventListener('mouseup', this.onMouseUp);
	},
	computed: {
		...mapStores(useNDVStore),
		isDragging(): boolean {
			return this.ndvStore.isDraggableDragging;
		},
		draggableType(): string {
			return this.ndvStore.draggableType;
		},
		droppable(): boolean {
			return !this.disabled && this.isDragging && this.draggableType === this.type;
		},
		activeDrop(): boolean {
			return this.droppable && this.hovering;
		},
	},
	methods: {
		onMouseMove(e: MouseEvent) {
			const targetRef = this.$refs.target as HTMLElement | undefined;

			if (targetRef && this.isDragging) {
				const dim = targetRef.getBoundingClientRect();

				this.hovering =
					e.clientX >= dim.left &&
					e.clientX <= dim.right &&
					e.clientY >= dim.top &&
					e.clientY <= dim.bottom;

				if (!this.disabled && this.sticky && this.hovering) {
					const [xOffset, yOffset] = this.stickyOffset;

					this.ndvStore.setDraggableStickyPos([dim.left + xOffset, dim.top + yOffset]);
				}
			}
		},
		onMouseUp(e: MouseEvent) {
			if (this.activeDrop) {
				const data = this.ndvStore.draggableData;
				this.$emit('drop', data);
			}
		},
	},
	watch: {
		activeDrop(active) {
			this.ndvStore.setDraggableCanDrop(active);
		},
	},
});
</script>
