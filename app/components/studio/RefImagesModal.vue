<script setup lang="ts">
const props = defineProps<{
  images: string[]
}>()

const open = defineModel<boolean>('open', { default: false })
const { formatImageUrl } = useImageUrl()

/** 按索引记录加载失败（文件被清理或 404） */
const loadFailed = ref<Record<number, boolean>>({})

function isMissingUrl(url: string) {
  return !url?.trim()
}

function onImgError(index: number) {
  loadFailed.value = { ...loadFailed.value, [index]: true }
}

function isUnavailable(index: number, url: string) {
  return isMissingUrl(url) || loadFailed.value[index] === true
}

function resetLoadState() {
  loadFailed.value = {}
}

watch(open, (isOpen) => {
  if (isOpen) resetLoadState()
})

watch(
  () => props.images,
  () => resetLoadState(),
  { deep: true },
)
</script>

<template>
  <UModal v-model:open="open" title="参考图" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="grid gap-4" :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
        <div
          v-for="(img, index) in images"
          :key="index"
          class="relative bg-(--ui-bg-muted) rounded-lg overflow-hidden"
        >
          <div
            v-if="isUnavailable(index, img)"
            class="w-full min-h-[200px] flex items-center justify-center p-6"
          >
            <div class="text-center">
              <UIcon
                name="i-heroicons-trash"
                class="w-12 h-12 mb-2 text-(--ui-text-muted)"
              />
              <p class="text-sm mb-1 text-(--ui-text-muted)">文件已删除</p>
              <p class="text-(--ui-text-dimmed) text-xs">文件已被清理，无法查看</p>
            </div>
          </div>
          <template v-else>
            <img
              :src="formatImageUrl(img)"
              :alt="`参考图 ${index + 1}`"
              class="w-full h-auto max-h-[60vh] object-contain"
              @error="onImgError(index)"
            />
          </template>
          <div class="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs text-white">
            {{ index + 1 }} / {{ images.length }}
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
