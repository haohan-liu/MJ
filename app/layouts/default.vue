<script setup lang="ts">
// JWT 认证状态在客户端通过 plugin 初始化
</script>

<template>
  <div class="bg-(--ui-bg) flex min-h-screen flex-col">
    <AppHeader class="h-14 shrink-0" />
    <main class="flex min-h-0 flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
