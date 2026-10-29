import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { useGame } from '@blacklight/ui';
import type { ModelAnimationSettings } from './animator';
import { registerModelLoader } from './loader';
import { ModelPreview } from './preview';
import type { View3DOptions } from './view';

registerModelLoader();

/**
 * Shows a glTF model in a Vue screen of `@blacklight/ui`, rendered to a texture through the game's
 * WebGL context (3D-04): the rotating character of a menu. Sizes are UI virtual pixels; the canvas
 * is styled like any element (CSS filters, masks, clip paths apply).
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ModelView } from '@blacklight/three/ui';
 * </script>
 *
 * <template>
 *   <ModelView model="hero" animation="idle" :width="360" :height="480" :spin="25" />
 * </template>
 * ```
 */
export const ModelView = defineComponent({
  name: 'ModelView',
  props: {
    /** Asset key or project path of the model. */
    model: { type: String, required: true },
    /** Animation to play; changing it plays the new one. */
    animation: { type: String, default: undefined },
    width: { type: Number, default: 256 },
    height: { type: Number, default: 256 },
    /** Degrees per second around the vertical axis. */
    spin: { type: Number, default: 0 },
    /** Starting turn, in degrees. */
    yaw: { type: Number, default: 0 },
    view: { type: Object as PropType<View3DOptions>, default: undefined },
    pixelsPerUnit: { type: Number, default: undefined },
    animations: {
      type: Object as PropType<Record<string, ModelAnimationSettings>>,
      default: undefined,
    },
  },
  emits: {
    /** The model is loaded and drawn. */
    ready: (_preview: ModelPreview) => true,
  },
  setup(props, { emit, expose }) {
    const game = useGame();
    const canvas = ref<HTMLCanvasElement>();
    let preview: ModelPreview | undefined;

    const create = () => {
      preview?.destroy();
      const current = new ModelPreview(game, {
        model: props.model,
        width: props.width,
        height: props.height,
        animation: props.animation,
        spin: props.spin,
        yaw: props.yaw,
        view: props.view,
        pixelsPerUnit: props.pixelsPerUnit,
        animations: props.animations,
        canvas: canvas.value,
      });
      preview = current;
      current.ready.then(
        () => preview === current && emit('ready', current),
        (error: unknown) => console.error(error),
      );
    };

    onMounted(create);
    watch(() => [props.model, props.width, props.height, props.view, props.pixelsPerUnit], create);
    watch(
      () => props.animation,
      (name) => {
        if (name && preview?.animator) preview.play(name);
      },
    );
    watch(
      () => props.spin,
      (spin) => preview?.setSpin(spin),
    );
    onBeforeUnmount(() => preview?.destroy());
    expose({ preview: () => preview });

    return () =>
      h('canvas', {
        ref: canvas,
        class: 'bl-model-view',
        'data-model': props.model,
        style: { width: `${props.width}px`, height: `${props.height}px`, display: 'block' },
      });
  },
});

export { ModelPreview, type ModelPreviewOptions } from './preview';
