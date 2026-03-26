<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { user } = useAuth()

onMounted(() => {
  // 管理员跳转到上游配置，普通用户跳转到通用设置
  if (user.value?.role === 'admin') {
    router.replace('/settings/upstreams')
  } else {
    router.replace('/settings/general')
  }
})
</script>

<template>
  <div class="p-6 text-center">
    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
  </div>
</template>
