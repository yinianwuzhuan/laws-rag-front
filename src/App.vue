<template>
  <div class="app-container">
    <template v-if="!isMobile">
      <el-container>
        <el-aside width="220px" class="sidebar">
          <div class="logo">
            <el-icon :size="28"><Document /></el-icon>
            <span>法律 RAG 系统</span>
          </div>
          <el-menu
            :default-active="activeMenu"
            class="sidebar-menu"
            router
          >
            <el-menu-item index="/chat">
              <el-icon><ChatDotRound /></el-icon>
              <span>法律咨询</span>
            </el-menu-item>
            <el-menu-item index="/upload">
              <el-icon><Upload /></el-icon>
              <span>文件上传</span>
            </el-menu-item>
            <el-sub-menu index="/system-evaluation">
              <template #title>
                <el-icon><DataAnalysis /></el-icon>
                <span>系统效果评测</span>
              </template>
              <el-menu-item index="/query">
                <el-icon><Search /></el-icon>
                <span>自由检索测评</span>
              </el-menu-item>
              <el-menu-item index="/evaluation">
                <el-icon><DataAnalysis /></el-icon>
                <span>检索评测</span>
              </el-menu-item>
              <el-menu-item index="/generation-evaluation">
                <el-icon><TrendCharts /></el-icon>
                <span>生成评测</span>
              </el-menu-item>
            </el-sub-menu>
          </el-menu>
        </el-aside>
        <el-main class="main-content">
          <router-view />
        </el-main>
      </el-container>
    </template>

    <template v-else>
      <div class="mobile-header">
        <el-button circle text class="menu-trigger" @click="drawerVisible = true">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
        <div class="mobile-title">法律 RAG 系统</div>
      </div>
      <main class="main-content mobile-main-content">
        <router-view />
      </main>

      <el-drawer
        v-model="drawerVisible"
        direction="ltr"
        size="220px"
        :with-header="false"
      >
        <div class="logo drawer-logo">
          <el-icon :size="24"><Document /></el-icon>
          <span>法律 RAG 系统</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          class="sidebar-menu"
          router
          @select="drawerVisible = false"
        >
          <el-menu-item index="/chat">
            <el-icon><ChatDotRound /></el-icon>
            <span>法律咨询</span>
          </el-menu-item>
          <el-menu-item index="/upload">
            <el-icon><Upload /></el-icon>
            <span>文件上传</span>
          </el-menu-item>
          <el-sub-menu index="/system-evaluation">
            <template #title>
              <el-icon><DataAnalysis /></el-icon>
              <span>系统效果评测</span>
            </template>
            <el-menu-item index="/query">
              <el-icon><Search /></el-icon>
              <span>自由检索测评</span>
            </el-menu-item>
            <el-menu-item index="/evaluation">
              <el-icon><DataAnalysis /></el-icon>
              <span>检索评测</span>
            </el-menu-item>
            <el-menu-item index="/generation-evaluation">
              <el-icon><TrendCharts /></el-icon>
              <span>生成评测</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-drawer>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Document, Upload, Search, ChatDotRound, Menu, DataAnalysis, TrendCharts } from '@element-plus/icons-vue'

const route = useRoute()
const drawerVisible = ref(false)
const isMobile = ref(false)

const updateViewport = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewport)
})

const activeMenu = computed(() => {
  return route.path
})
</script>

<style lang="scss" scoped>
.app-container {
  height: 100dvh;
  width: 100vw;
}

.el-container {
  height: 100%;
}

.sidebar {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  
  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    
    .el-icon {
      color: #409eff;
    }
  }
  
  .sidebar-menu {
    border: none;
    background: transparent;
    
    :deep(.el-menu-item) {
      color: rgba(255, 255, 255, 0.7);
      
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      
      &.is-active {
        background: linear-gradient(90deg, #409eff 0%, rgba(64, 158, 255, 0.5) 100%);
        color: #fff;
      }
      
      .el-icon {
        color: inherit;
      }
    }

    :deep(.el-sub-menu__title) {
      color: rgba(255, 255, 255, 0.7);

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .el-icon,
      .el-sub-menu__icon-arrow {
        color: inherit;
      }
    }

    :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
      color: #fff;
    }

    :deep(.el-sub-menu .el-menu) {
      background: transparent;
    }

    :deep(.el-sub-menu .el-menu-item) {
      min-width: 0;
      color: rgba(255, 255, 255, 0.7);
      background: transparent;

      &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      &.is-active {
        color: #fff;
        background: linear-gradient(90deg, #409eff 0%, rgba(64, 158, 255, 0.5) 100%);
      }
    }
  }
}

.sidebar-menu {
  border: none;
}

.main-content {
  background: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
}

.mobile-header {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.mobile-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.mobile-main-content {
  height: calc(100dvh - 56px);
  padding: 12px;
}

.drawer-logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  justify-content: flex-start;
  color: #303133;
  border-bottom-color: #e4e7ed;
  margin-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
  font-size: 16px;
  font-weight: 600;

  .el-icon {
    color: #409eff;
  }
}

:deep(.el-drawer__body) {
  padding: 0;

  .sidebar-menu {
    border-right: none;
  }
}
</style>
