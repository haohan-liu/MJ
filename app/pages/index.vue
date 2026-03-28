<script setup lang="ts">
// 首页无需登录
const { loggedIn } = useAuth()
const { siteName, siteSlogan, siteCopyright } = useSiteSettings()
</script>

<template>
  <div class="flex w-full flex-1 flex-col">
    <!-- Hero Section -->
    <section class="flex flex-1 flex-col justify-center px-6 py-8 sm:py-12">
      <div class="max-w-4xl mx-auto text-center">
        <!-- Logo -->
        <div class="mb-8">
          <UIcon name="i-heroicons-sparkles" class="w-12 h-12 sm:w-16 sm:h-16 text-(--ui-primary) mx-auto mb-4" />
          <h1 class="text-4xl sm:text-5xl font-bold mb-3">
            <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {{ siteName }}
            </span>
          </h1>
          <p class="text-base sm:text-xl text-(--ui-text-muted)">{{ siteSlogan }}</p>
        </div>

        <!-- 特性介绍 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
          <div class="group flex flex-col p-5 sm:p-6 rounded-xl bg-(--ui-bg-elevated) border border-(--ui-border) text-center h-full transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl hover:shadow-purple-500/20 hover:border-purple-500/50">
            <UIcon name="i-heroicons-sparkles" class="w-8 h-8 sm:w-10 sm:h-10 text-purple-500 mx-auto mb-3 sm:mb-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <h3 class="text-base sm:text-lg font-medium text-(--ui-text) mb-2">AI创作工坊</h3>
            <p class="text-xs sm:text-sm text-(--ui-text-muted) leading-relaxed flex-1">
              一站式支持 AI 绘画与视频生成，轻松开启艺术之旅。
            </p>
          </div>
          <div class="group flex flex-col p-5 sm:p-6 rounded-xl bg-(--ui-bg-elevated) border border-(--ui-border) text-center h-full transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20 hover:border-blue-500/50">
            <UIcon name="i-heroicons-user-circle" class="w-8 h-8 sm:w-10 sm:h-10 text-blue-500 mx-auto mb-3 sm:mb-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <h3 class="text-base sm:text-lg font-medium text-(--ui-text) mb-2">专属 AI 助手</h3>
            <p class="text-xs sm:text-sm text-(--ui-text-muted) leading-relaxed flex-1">
              打造专属对话助手，支持自定义知识库与系统提示词。
            </p>
          </div>
          <div class="group flex flex-col p-5 sm:p-6 rounded-xl bg-(--ui-bg-elevated) border border-(--ui-border) text-center h-full sm:col-span-2 lg:col-span-1 transition-all duration-300 ease-out hover:scale-105 hover:shadow-xl hover:shadow-green-500/20 hover:border-green-500/50">
            <UIcon name="i-heroicons-shield-check" class="w-8 h-8 sm:w-10 sm:h-10 text-green-500 mx-auto mb-3 sm:mb-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <h3 class="text-base sm:text-lg font-medium text-(--ui-text) mb-2">全方位隐私防线</h3>
            <p class="text-xs sm:text-sm text-(--ui-text-muted) leading-relaxed flex-1">
              数据本地化存储，内置屏幕防窥，守护您的隐私安全。
            </p>
          </div>
        </div>

        <!-- CTA -->
        <div class="flex flex-wrap justify-center gap-3 sm:gap-4">
          <NuxtLink v-if="loggedIn" to="/studio">
            <UButton size="lg" class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <UIcon name="i-heroicons-paint-brush" class="w-5 h-5 mr-2" />
              开始创作
            </UButton>
          </NuxtLink>
          <NuxtLink v-else to="/login">
            <UButton size="lg" class="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <UIcon name="i-heroicons-arrow-right-end-on-rectangle" class="w-5 h-5 mr-2" />
              登录开始
            </UButton>
          </NuxtLink>
          <NuxtLink v-if="loggedIn" to="/chat">
            <UButton size="lg" variant="outline">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 mr-2" />
              AI 对话
            </UButton>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="shrink-0 border-t border-(--ui-border) py-4 mt-auto">
      <div class="max-w-7xl mx-auto px-6 text-center text-sm text-(--ui-text-dimmed)">
        <p v-if="siteCopyright">{{ siteCopyright }}</p>
        <p v-else>&copy; {{ new Date().getFullYear() }} {{ siteName }}. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>
