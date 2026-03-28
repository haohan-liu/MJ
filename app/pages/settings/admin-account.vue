<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const { user, logout } = useAuth()
const toast = useToast()

if (user.value?.role !== 'admin') {
  navigateTo('/settings')
}

const isLoading = ref(true)
const isSaving = ref(false)

const form = reactive({
  username: '',
  name: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

/** 管理员是否已有密码（来自接口，用于校验「当前密码」是否必填） */
const adminPasswordSet = ref(false)

async function loadAdminInfo() {
  isLoading.value = true
  try {
    const admin = await $fetch<{
      id: number
      username: string
      email: string | null
      name: string | null
      passwordSet?: boolean
    }>('/api/admin/admin-account')

    form.username = admin.username || ''
    form.name = admin.name || ''
    adminPasswordSet.value = admin.passwordSet ?? false
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

async function saveChanges() {
  if (form.newPassword || form.confirmPassword) {
    if (adminPasswordSet.value && !form.currentPassword) {
      toast.add({
        title: '请输入当前密码',
        description: '修改密码时需要验证当前密码',
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
    if (form.newPassword) {
      body.password = form.newPassword
      if (form.currentPassword) {
        body.currentPassword = form.currentPassword
      }
    }

    await $fetch('/api/admin/admin-account', {
      method: 'PUT',
      body,
    })

    const passwordChanged = !!form.newPassword

    toast.add({
      title: '保存成功',
      description: passwordChanged ? '已更新，请使用新方式重新登录' : '管理员账号信息已更新',
      color: 'success',
    })

    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''

    if (passwordChanged) {
      await new Promise(resolve => setTimeout(resolve, 800))
      logout()
      await navigateTo('/login')
    } else {
      await loadAdminInfo()
    }
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
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium text-(--ui-text)">管理员账号</h2>
          <p class="text-(--ui-text-muted) text-sm mt-1">修改唯一管理员的登录账号与密码（仅更新当前管理员，不会新建用户）</p>
        </div>
      </div>

      <div v-if="isLoading" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-(--ui-text-dimmed) animate-spin" />
      </div>

      <div v-else class="max-w-xl">
        <div class="bg-(--ui-bg-elevated) rounded-lg p-6 border border-(--ui-border) space-y-6">
          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">基本信息</h3>

            <UFormField label="账号" required>
              <UInput
                v-model="form.username"
                placeholder="输入管理员账号"
                class="w-full"
              />
              <template #hint>
                <span class="text-(--ui-text-dimmed) text-xs">对应数据库中 role 为 admin 的唯一用户</span>
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

          <div class="space-y-4">
            <h3 class="text-base font-medium text-(--ui-text)">修改密码</h3>
            <p class="text-sm text-(--ui-text-muted)">
              不修改密码请留空。{{ adminPasswordSet ? '已设置过密码时，修改必须填写当前密码。' : '当前尚未设置密码时，可直接设置新密码。' }}
            </p>

            <UFormField label="当前密码" :required="!!form.newPassword && adminPasswordSet">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="form.currentPassword"
                  :type="showCurrentPassword ? 'text' : 'password'"
                  placeholder="已有密码时必填"
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
                  placeholder="至少 6 位"
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

          <div class="flex justify-end gap-3 pt-4">
            <UButton variant="outline" @click="resetForm">
              重置
            </UButton>
            <UButton :loading="isSaving" @click="saveChanges">
              保存修改
            </UButton>
          </div>
        </div>

        <div class="mt-6 p-4 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border)">
          <div class="flex gap-3">
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-(--ui-primary) shrink-0 mt-0.5" />
            <div class="text-sm text-(--ui-text-muted) space-y-1">
              <p>本站登录使用外部聚合 API Key；此处密码仅用于后台预留或后续扩展，修改密码成功后会退出并跳转到登录页。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>
