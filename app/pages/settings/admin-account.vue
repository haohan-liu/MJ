<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { user, logout } = useAuth()
const toast = useToast()

// 检查管理员权限
if (user.value?.role !== 'admin') {
  navigateTo('/settings')
}

const isLoading = ref(true)
const isSaving = ref(false)

// 表单数据
const form = reactive({
  username: '',
  name: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

// 密码可见性
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// 加载管理员信息
async function loadAdminInfo() {
  isLoading.value = true
  try {
    const admin = await $fetch<{
      id: number
      username: string
      email: string | null
      name: string | null
    }>('/api/admin/admin-account')

    form.username = admin.username || ''
    form.name = admin.name || ''
  } catch (error: any) {
    toast.add({
      title: '加载失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isLoading.value = false
  }
}

// 保存修改
async function saveChanges() {
  // 验证表单
  if (form.newPassword || form.confirmPassword) {
    if (!form.currentPassword) {
      toast.add({
        title: '请输入当前密码',
        description: '修改密码时必须输入当前密码',
        color: 'error',
      })
      return
    }

    if (form.newPassword.length < 6) {
      toast.add({
        title: '新密码长度不足',
        description: '新密码长度不能少于6位',
        color: 'error',
      })
      return
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.add({
        title: '密码不一致',
        description: '新密码与确认密码不匹配',
        color: 'error',
      })
      return
    }
  }

  if (form.username && form.username.length < 2) {
    toast.add({
      title: '用户名长度不足',
      description: '用户名长度不能少于2位',
      color: 'error',
    })
    return
  }

  isSaving.value = true
  try {
    const body: Record<string, string> = {}

    if (form.username) {
      body.username = form.username
    }

    if (form.name !== undefined) {
      body.name = form.name
    }

    // 如果要修改密码
    if (form.newPassword) {
      body.currentPassword = form.currentPassword
      body.password = form.newPassword
    }

    await $fetch('/api/admin/admin-account', {
      method: 'PUT',
      body,
    })

    toast.add({
      title: '保存成功',
      description: '管理员账号信息已更新，将跳转到登录页面',
      color: 'success',
    })

    // 清空密码字段
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''

    // 延迟跳转，让用户看清成功提示
    await new Promise(resolve => setTimeout(resolve, 1000))
    logout()
    await navigateTo('/admin-login')
  } catch (error: any) {
    toast.add({
      title: '保存失败',
      description: error.data?.message || error.message,
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}

// 重置表单
function resetForm() {
  form.currentPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  loadAdminInfo()
}

onMounted(() => {
  loadAdminInfo()
})
</script>

<template>
  <SettingsLayout>
    <div class="space-y-6">
      <!-- 页面标题 -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium text-(--ui-text)">管理员账号</h2>
          <p class="text-(--ui-text-muted) text-sm mt-1">修改管理员的登录账号和密码</p>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <div v-else class="max-w-xl">
        <!-- 表单卡片 -->
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-6">
          <!-- 基本信息 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">基本信息</h3>

            <UFormField label="账号" required>
              <UInput
                v-model="form.username"
                placeholder="输入管理员账号"
                class="w-full"
              />
              <template #hint>
                <span class="text-(--ui-text-dimmed) text-xs">用于登录管理后台</span>
              </template>
            </UFormField>

            <UFormField label="显示名称">
              <UInput
                v-model="form.name"
                placeholder="输入显示名称"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="border-t border-(--ui-border)" />

          <!-- 修改密码 -->
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">修改密码</h3>
            <p class="text-sm text-(--ui-text-muted)">如果不修改密码，请留空以下密码字段</p>

            <UFormField label="当前密码" :required="!!form.newPassword">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="form.currentPassword"
                  :type="showCurrentPassword ? 'text' : 'password'"
                  placeholder="输入当前密码"
                  class="flex-1"
                />
                <UButton
                  variant="ghost"
                  size="sm"
                  @click="showCurrentPassword = !showCurrentPassword"
                >
                  <UIcon :name="showCurrentPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
                </UButton>
              </div>
            </UFormField>

            <UFormField label="新密码">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="form.newPassword"
                  :type="showNewPassword ? 'text' : 'password'"
                  placeholder="输入新密码（至少6位）"
                  class="flex-1"
                />
                <UButton
                  variant="ghost"
                  size="sm"
                  @click="showNewPassword = !showNewPassword"
                >
                  <UIcon :name="showNewPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
                </UButton>
              </div>
            </UFormField>

            <UFormField label="确认新密码">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="form.confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  placeholder="再次输入新密码"
                  class="flex-1"
                />
                <UButton
                  variant="ghost"
                  size="sm"
                  @click="showConfirmPassword = !showConfirmPassword"
                >
                  <UIcon :name="showConfirmPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
                </UButton>
              </div>
            </UFormField>
          </div>

          <!-- 操作按钮 -->
          <div class="flex justify-end gap-3 pt-4">
            <UButton
              variant="outline"
              @click="resetForm"
            >
              重置
            </UButton>
            <UButton
              :loading="isSaving"
              @click="saveChanges"
            >
              保存修改
            </UButton>
          </div>
        </div>

        <!-- 提示信息 -->
        <div class="mt-6 p-4 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
          <div class="flex gap-3">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-(--ui-primary) shrink-0 mt-0.5" />
            <div class="text-sm text-(--ui-text-muted) space-y-1">
              <p>修改账号或密码后，需要使用新信息重新登录。</p>
              <p>请妥善保管您的账号和密码，不要泄露给他人。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>
