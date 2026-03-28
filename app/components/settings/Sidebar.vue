<script setup lang="ts">
defineProps<{
  mobile?: boolean
}>()

const route = useRoute()
const { user } = useAuth()

// 从父组件获取关闭抽屉的方法
const closeDrawer = inject<() => void>('closeSettingsDrawer', () => {})

const menuItems = [
  {
    label: '上游配置',
    icon: 'i-heroicons-cpu-chip',
    to: '/settings/upstreams',
    adminOnly: true,
  },
  {
    label: '代理配置',
    icon: 'i-heroicons-globe-alt',
    to: '/settings/proxies',
    adminOnly: true,
  },
  {
    label: '模型测试',
    icon: 'i-heroicons-beaker',
    to: '/settings/model-test',
    adminOnly: true,
  },
  {
    label: '公告管理',
    icon: 'i-heroicons-megaphone',
    to: '/settings/announcements',
    adminOnly: true,
  },
    {
    label: '通用设置',
    icon: 'i-heroicons-cog-6-tooth',
    to: '/settings/general',
    adminOnly: true,
  },
  {
    label: '站点配置',
    icon: 'i-heroicons-building-office',
    to: '/settings/site',
    adminOnly: true,
  },
  {
    label: '管理员账号',
    icon: 'i-heroicons-user-circle',
    to: '/settings/admin-account',
    adminOnly: true,
  },
]

// 过滤菜单项（管理员可见所有，普通用户隐藏管理员专属）
const visibleMenuItems = computed(() => {
  return menuItems.filter(item => !item.adminOnly || user.value?.role === 'admin')
})

function isActive(to: string): boolean {
  return route.path.startsWith(to)
}

function handleClick() {
  closeDrawer()
}
</script>

<template>
  <nav class="w-48 shrink-0 space-y-1">
    <NuxtLink
      v-for="item in visibleMenuItems"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
      :class="isActive(item.to)
        ? 'bg-(--ui-primary)/10 text-(--ui-primary)'
        : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)'"
      @click="mobile && handleClick()"
    >
      <UIcon :name="item.icon" class="w-5 h-5" />
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>
