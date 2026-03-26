<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

import type { Announcement } from '~/server/database/schema'

const toast = useToast()
const { user } = useAuth()

// 检查管理员权限
if (user.value?.role !== 'admin') {
  navigateTo('/')
}

// 公告列表
const announcements = ref<Announcement[]>([])
const isLoading = ref(false)

// 编辑状态
const isEditing = ref(false)
const editingId = ref<number | null>(null)

// 表单
const form = reactive({
  content: '',
  type: 'info' as 'info' | 'warning' | 'success' | 'error',
  icon: '',
  enabled: true,
  sortOrder: 0,
})

// 类型选项
const typeOptions = [
  { value: 'info', label: '信息', icon: 'i-heroicons-information-circle', color: 'text-blue-500' },
  { value: 'warning', label: '警告', icon: 'i-heroicons-exclamation-triangle', color: 'text-yellow-500' },
  { value: 'success', label: '成功', icon: 'i-heroicons-check-circle', color: 'text-green-500' },
  { value: 'error', label: '错误', icon: 'i-heroicons-x-circle', color: 'text-red-500' },
]

// 加载公告列表
async function loadAnnouncements() {
  isLoading.value = true
  try {
    const result = await $fetch<{ success: boolean; data: Announcement[] }>('/api/admin/announcements')
    if (result.success) {
      announcements.value = result.data
    }
  } catch (error) {
    toast.add({ title: '加载失败', color: 'error' })
  } finally {
    isLoading.value = false
  }
}

// 重置表单
function resetForm() {
  form.content = ''
  form.type = 'info'
  form.icon = ''
  form.enabled = true
  form.sortOrder = 0
  editingId.value = null
  isEditing.value = false
}

// 编辑公告
function editAnnouncement(announcement: Announcement) {
  form.content = announcement.content
  form.type = announcement.type
  form.icon = announcement.icon || ''
  form.enabled = announcement.enabled
  form.sortOrder = announcement.sortOrder
  editingId.value = announcement.id
  isEditing.value = true
}

// 保存公告
async function saveAnnouncement() {
  if (!form.content.trim()) {
    toast.add({ title: '请输入公告内容', color: 'error' })
    return
  }

  try {
    if (editingId.value) {
      // 更新
      await $fetch(`/api/admin/announcements/${editingId.value}`, {
        method: 'PUT',
        body: form,
      })
      toast.add({ title: '公告已更新', color: 'success' })
    } else {
      // 创建
      await $fetch('/api/admin/announcements', {
        method: 'POST',
        body: form,
      })
      toast.add({ title: '公告已创建', color: 'success' })
    }
    resetForm()
    loadAnnouncements()
  } catch (error: any) {
    toast.add({ title: '保存失败', description: error.data?.message, color: 'error' })
  }
}

// 删除公告
async function deleteAnnouncement(id: number) {
  if (!confirm('确定要删除这条公告吗？')) return

  try {
    await $fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' })
    toast.add({ title: '公告已删除', color: 'success' })
    loadAnnouncements()
  } catch (error) {
    toast.add({ title: '删除失败', color: 'error' })
  }
}

// 切换启用状态
async function toggleEnabled(announcement: Announcement) {
  try {
    await $fetch(`/api/admin/announcements/${announcement.id}`, {
      method: 'PUT',
      body: { enabled: !announcement.enabled },
    })
    loadAnnouncements()
  } catch (error) {
    toast.add({ title: '操作失败', color: 'error' })
  }
}

// 获取类型配置
function getTypeConfig(type: string) {
  return typeOptions.find(t => t.value === type) || typeOptions[0]
}

onMounted(() => {
  loadAnnouncements()
})
</script>

<template>
  <SettingsLayout>
    <div class="space-y-6">
      <!-- 标题 -->
      <div>
        <h2 class="text-lg font-medium text-(--ui-text)">公告管理</h2>
        <p class="text-sm text-(--ui-text-muted) mt-1">
          管理系统公告，公告将在首页和登录页展示
        </p>
      </div>

      <!-- 添加/编辑表单 -->
      <div class="p-4 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)">
        <h3 class="text-base font-medium text-(--ui-text) mb-4">
          {{ isEditing ? '编辑公告' : '添加公告' }}
        </h3>

        <div class="space-y-4">
          <!-- 内容 -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-1">公告内容 *</label>
            <UTextarea
              v-model="form.content"
              placeholder="支持链接语法：前往 [平台名称](https://example.com) 注册"
              :rows="2"
              class="w-full"
            />
            <p class="text-xs text-(--ui-text-muted) mt-1">
              链接格式：<code class="bg-(--ui-bg-accented) px-1 rounded">[显示文字](URL地址)</code>，例如：前往 <code class="bg-(--ui-bg-accented) px-1 rounded">[API平台](https://api.example.com)</code> 注册
            </p>
          </div>

          <!-- 类型和排序 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-(--ui-text) mb-1">类型</label>
              <USelect
                v-model="form.type"
                :items="typeOptions.map(t => ({ value: t.value, label: t.label }))"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-(--ui-text) mb-1">排序（越小越靠前）</label>
              <UInput
                v-model.number="form.sortOrder"
                type="number"
                :min="0"
                class="w-full"
              />
            </div>
          </div>

          <!-- 自定义图标 + 启用状态 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-(--ui-text) mb-1">自定义图标（可选）</label>
              <UInput
                v-model="form.icon"
                placeholder="i-heroicons-megaphone"
                class="w-full"
              />
            </div>
            <div class="flex items-end">
              <div class="flex items-center gap-2 mb-2">
                <UCheckbox v-model="form.enabled" />
                <label class="text-sm text-(--ui-text)">启用此公告</label>
              </div>
            </div>
          </div>

          <!-- 按钮 -->
          <div class="flex gap-2">
            <UButton @click="saveAnnouncement" class="bg-gradient-to-r from-purple-500 to-pink-500">
              {{ isEditing ? '更新公告' : '添加公告' }}
            </UButton>
            <UButton v-if="isEditing" variant="outline" @click="resetForm">
              取消编辑
            </UButton>
          </div>
        </div>
      </div>

      <!-- 公告列表 -->
      <div class="rounded-lg border border-(--ui-border)">
        <div class="p-4 border-b border-(--ui-border)">
          <h3 class="text-base font-medium text-(--ui-text)">公告列表</h3>
        </div>

        <div v-if="isLoading" class="p-8 text-center">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-(--ui-text-muted)" />
        </div>

        <div v-else-if="announcements.length === 0" class="p-8 text-center text-(--ui-text-muted)">
          暂无公告
        </div>

        <div v-else class="divide-y divide-(--ui-border)">
          <div
            v-for="announcement in announcements"
            :key="announcement.id"
            class="p-4 flex items-start gap-3"
          >
            <!-- 类型图标 -->
            <div :class="['flex-shrink-0 mt-0.5', getTypeConfig(announcement.type).color]">
              <UIcon :name="announcement.icon || getTypeConfig(announcement.type).icon" class="w-5 h-5" />
            </div>

            <!-- 内容 -->
            <div class="flex-1 min-w-0">
              <p class="text-sm text-(--ui-text) break-words">
                {{ announcement.content }}
              </p>
              <div class="flex items-center gap-3 mt-1 text-xs text-(--ui-text-muted)">
                <span>类型: {{ getTypeConfig(announcement.type).label }}</span>
                <span>排序: {{ announcement.sortOrder }}</span>
              </div>
            </div>

            <!-- 操作 -->
            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                variant="ghost"
                :color="announcement.enabled ? 'success' : 'neutral'"
                @click="toggleEnabled(announcement)"
              >
                {{ announcement.enabled ? '已启用' : '已禁用' }}
              </UButton>
              <UButton size="xs" variant="ghost" @click="editAnnouncement(announcement)">
                编辑
              </UButton>
              <UButton size="xs" variant="ghost" color="error" @click="deleteAnnouncement(announcement.id)">
                删除
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>
