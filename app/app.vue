<script setup lang="ts">
const { siteName, siteLogo, loadSettings } = useSiteSettings()

// 初始化加载站点设置
await loadSettings()

// 动态设置页面标题和 Favicon（使用 computed 确保响应式）
useHead({
  title: () => siteName.value,
  link: () => siteLogo.value ? [{ rel: 'icon', type: 'image/x-icon', href: siteLogo.value }] : [],
})

const toaster = {
  position: 'top-right' as const,
  duration: 1500,
  swipeDirection: 'right' as const,
}
</script>

<template>
  <UApp :toaster="toaster">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
