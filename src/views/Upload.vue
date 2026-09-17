<template>
  <div class="upload-page">
    <div class="page-card">
      <div class="page-title">
        <el-icon><Upload /></el-icon>
        <span>文档上传</span>
      </div>
      
      <div class="upload-container">
        <!-- 来源信息表单 -->
        <el-form :model="formData" :rules="formRules" ref="formRef" label-width="90px" class="source-form">
          <el-form-item label="来源类型" prop="sourceType">
            <el-select
              v-model="formData.sourceType"
              placeholder="请选择来源类型"
              :loading="sourceTypesLoading"
              style="width: 100%"
            >
              <el-option
                v-for="item in sourceTypes"
                :key="item.code"
                :label="item.label"
                :value="item.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="来源名称" prop="sourceName">
            <el-input
              v-model="formData.sourceName"
              placeholder="请输入来源名称，如：中华人民共和国民法典"
              clearable
            />
          </el-form-item>
        </el-form>

<el-upload
          ref="uploadRef"
          class="upload-dragger"
          drag
          multiple
          :auto-upload="false"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          :on-exceed="handleExceed"
          :file-list="fileList"
          accept=".md,.markdown"
          :limit="50"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将多个 MD 文件拖到此处，或<em>点击批量选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              已选择 {{ fileList.length }} 个文件；仅支持 .md / .markdown，单个文件不超过 10MB，最多50个
            </div>
          </template>
        </el-upload>

        <div class="upload-actions">
          <el-button
            type="info"
            :loading="previewing"
            :disabled="fileList.length === 0"
            @click="handlePreview"
          >
            <el-icon><View /></el-icon>
            {{ fileList.length > 1 ? '预览首个文件' : '预览解析' }}
          </el-button>
          <el-button
            type="primary"
            :loading="uploading"
            :disabled="fileList.length === 0"
            @click="handleUpload"
          >
            <el-icon><Upload /></el-icon>
            批量上传入库（{{ fileList.length }}）
          </el-button>
          <el-button @click="handleClear">
            <el-icon><Delete /></el-icon>
            清空
          </el-button>
        </div>
      </div>
    </div>

    <!-- 预览结果 -->
    <div class="page-card" v-if="previewResult">
      <div class="page-title">
        <el-icon><Document /></el-icon>
        <span>预览结果</span>
        <el-tag type="success" v-if="previewResult.success">解析成功</el-tag>
        <el-tag type="danger" v-else>解析失败</el-tag>
      </div>
      
      <div class="preview-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="文件名">
            {{ previewResult.fileName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="文档名称">
            {{ getFirstMetadata('source_name') || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="总条数">
            {{ previewResult.totalArticles || previewResult.preview?.length || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="文档类型">
            {{ getFirstMetadata('source_type') || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="书籍名称">
            {{ getFirstMetadata('book') || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="所属编">
            {{ getFirstMetadata('part') || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 分块预览 -->
        <div class="chunks-preview" v-if="previewResult.preview && previewResult.preview.length > 0">
          <div class="chunks-title">
            <el-icon><List /></el-icon>
            文档分块预览 (共 {{ previewResult.preview.length }} 条，显示前 10 条)
          </div>
          <el-collapse accordion>
            <el-collapse-item
              v-for="(chunk, index) in previewResult.preview.slice(0, 10)"
              :key="index"
              :name="index"
            >
              <template #title>
                <div class="chunk-title">
                  <el-tag type="primary" size="small">{{ chunk.metadata?.article_no || `第${index + 1}条` }}</el-tag>
                  <span class="chunk-chapter">{{ chunk.metadata?.chapter || '' }}</span>
                </div>
              </template>
              <div class="chunk-content">
                <el-descriptions :column="2" border size="small">
                  <el-descriptions-item label="书名" v-if="chunk.metadata?.book">
                    {{ chunk.metadata.book }}
                  </el-descriptions-item>
                  <el-descriptions-item label="编" v-if="chunk.metadata?.part">
                    {{ chunk.metadata.part }}
                  </el-descriptions-item>
                  <el-descriptions-item label="章" v-if="chunk.metadata?.chapter">
                    {{ chunk.metadata.chapter }}
                  </el-descriptions-item>
                  <el-descriptions-item label="节" v-if="chunk.metadata?.section">
                    {{ chunk.metadata.section }}
                  </el-descriptions-item>
                  <el-descriptions-item label="条文号" v-if="chunk.metadata?.article_no">
                    {{ chunk.metadata.article_no }}
                  </el-descriptions-item>
                  <el-descriptions-item label="字符数" v-if="chunk.metadata?.char_count">
                    {{ chunk.metadata.char_count }}
                  </el-descriptions-item>
                  <el-descriptions-item label="来源类型" v-if="chunk.metadata?.source_type">
                    {{ chunk.metadata.source_type }}
                  </el-descriptions-item>
                  <el-descriptions-item label="业务ID" v-if="chunk.metadata?.business_id">
                    {{ chunk.metadata.business_id }}
                  </el-descriptions-item>
                </el-descriptions>
                <div class="chunk-text">
                  {{ chunk.text }}
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
          <div class="chunks-tip" v-if="previewResult.preview.length > 10">
            <el-tag type="info">仅显示前 10 条，共 {{ previewResult.preview.length }} 条</el-tag>
          </div>
        </div>

        <!-- 原始数据 -->
        <div class="raw-data">
          <el-collapse>
            <el-collapse-item title="查看原始数据" name="raw">
              <pre class="raw-json">{{ JSON.stringify(previewResult, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>
    </div>

    <!-- 上传结果 -->
    <div class="page-card" v-if="uploadResult">
      <div class="page-title">
        <el-icon><CircleCheck /></el-icon>
        <span>上传结果</span>
      </div>
      
      <el-result
        :icon="uploadResult.failureCount === 0 ? 'success' : uploadResult.successCount > 0 ? 'warning' : 'error'"
        :title="uploadResult.failureCount === 0 ? '全部上传成功' : uploadResult.successCount > 0 ? '部分文件上传失败' : '上传失败'"
        :sub-title="uploadResult.message"
      >
        <template #extra>
          <el-button type="primary" @click="resetUpload">继续上传</el-button>
        </template>
      </el-result>
      
      <div class="upload-detail">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="文件总数">{{ uploadResult.totalFiles }}</el-descriptions-item>
          <el-descriptions-item label="成功文件">{{ uploadResult.successCount }}</el-descriptions-item>
          <el-descriptions-item label="失败文件">{{ uploadResult.failureCount }}</el-descriptions-item>
          <el-descriptions-item label="实际入库法条">{{ uploadResult.articleCount }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="uploadResult.results" border class="result-table">
          <el-table-column prop="fileName" label="文件名" min-width="260" show-overflow-tooltip />
          <el-table-column label="状态" width="100" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.success ? 'success' : 'danger'">
                {{ scope.row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="articleCount" label="入库法条" width="110" align="center" />
          <el-table-column prop="message" label="处理结果" min-width="260" show-overflow-tooltip />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { lawApi } from '@/api'

const uploadRef = ref(null)
const formRef = ref(null)
const fileList = ref([])
const previewing = ref(false)
const uploading = ref(false)
const previewResult = ref(null)
const uploadResult = ref(null)

// 来源类型枚举
const sourceTypes = ref([])
const sourceTypesLoading = ref(false)

// 表单数据
const formData = ref({
  sourceType: '',
  sourceName: ''
})

const formRules = {
  sourceType: [{ required: true, message: '请选择来源类型', trigger: 'change' }],
  sourceName: [{ required: true, message: '请输入来源名称', trigger: 'blur' }]
}

// 加载来源类型枚举
onMounted(async () => {
  sourceTypesLoading.value = true
  try {
    const res = await lawApi.getSourceTypes()
    const data = res.data || res
    sourceTypes.value = data.data || data
  } catch (error) {
    console.error('加载来源类型失败:', error)
    ElMessage.warning('来源类型加载失败，请刷新重试')
  } finally {
    sourceTypesLoading.value = false
  }
})

// 获取第一条数据的 metadata 字段
const getFirstMetadata = (field) => {
  if (previewResult.value?.preview?.length > 0) {
    return previewResult.value.preview[0].metadata?.[field] || '-'
  }
  return '-'
}

const isMarkdownFile = (file) => /\.(md|markdown)$/i.test(file.name || '')

// 文件变化处理
const handleFileChange = (file, files) => {
  if (!isMarkdownFile(file)) {
    ElMessage.warning(`文件 ${file.name} 不是 Markdown 格式，已忽略`)
    uploadRef.value?.handleRemove(file)
    return
  }
  if ((file.size || 0) > 10 * 1024 * 1024) {
    ElMessage.warning(`文件 ${file.name} 超过 10MB，已忽略`)
    uploadRef.value?.handleRemove(file)
    return
  }
  fileList.value = files
  // 文件队列变化时清空旧结果
  previewResult.value = null
  uploadResult.value = null
}

// 文件移除处理
const handleFileRemove = (file, files) => {
  fileList.value = files
  previewResult.value = null
  uploadResult.value = null
}

// 超出文件数量限制
const handleExceed = (files) => {
  ElMessage.warning(`最多选择50个文件，本次有 ${files.length} 个文件未加入队列`)
}

// 预览解析
const handlePreview = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择要预览的文件')
    return
  }

  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请填写来源类型和来源名称')
    return
  }

  previewing.value = true
  previewResult.value = null
  
  try {
    const file = fileList.value[0]
    if (fileList.value.length > 1) {
      ElMessage.info(`当前仅预览队列首个文件：${file.name}`)
    }
    const res = await lawApi.preview(file.raw, formData.value.sourceType, formData.value.sourceName, (percent) => {
      file.percentage = percent
    })
    
    // 直接使用返回的数据
    previewResult.value = res.data || res
    
    ElMessage.success('文档解析成功')
  } catch (error) {
    console.error('预览失败:', error)
    previewResult.value = {
      success: false,
      message: error.message || '解析失败'
    }
    ElMessage.error('文档解析失败')
  } finally {
    previewing.value = false
  }
}

// 上传入库
const handleUpload = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请先选择要上传的文件')
    return
  }

  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请填写来源类型和来源名称')
    return
  }

  uploading.value = true
  uploadResult.value = null
  
  try {
    const rawFiles = fileList.value.map(file => file.raw).filter(Boolean)
    const res = await lawApi.uploadBatch(rawFiles, formData.value.sourceType, formData.value.sourceName, (percent) => {
      fileList.value.forEach(file => {
        file.percentage = percent
      })
    })
    
    const data = res.data || res
    uploadResult.value = {
      success: data.success === true,
      message: data.message || '批量上传处理完成',
      totalFiles: data.totalFiles ?? rawFiles.length,
      successCount: data.successCount ?? 0,
      failureCount: data.failureCount ?? rawFiles.length,
      articleCount: data.articleCount ?? 0,
      results: data.results || []
    }

    fileList.value.forEach(file => {
      const result = uploadResult.value.results.find(item => item.fileName === file.name)
      file.status = result?.success ? 'success' : 'fail'
      file.percentage = 100
    })

    if (uploadResult.value.failureCount === 0) {
      ElMessage.success('全部文档上传入库成功')
    } else if (uploadResult.value.successCount > 0) {
      ElMessage.warning('批量上传完成，部分文件失败')
    } else {
      ElMessage.error('全部文档上传失败')
    }
    previewResult.value = null
  } catch (error) {
    console.error('上传失败:', error)
    uploadResult.value = {
      success: false,
      message: error.message || '上传失败',
      totalFiles: fileList.value.length,
      successCount: 0,
      failureCount: fileList.value.length,
      articleCount: 0,
      results: fileList.value.map(file => ({
        fileName: file.name,
        success: false,
        articleCount: 0,
        message: error.message || '上传失败'
      }))
    }
    ElMessage.error('文档上传失败')
  } finally {
    uploading.value = false
  }
}

// 清空
const handleClear = () => {
  fileList.value = []
  previewResult.value = null
  uploadResult.value = null
  formData.value = { sourceType: '', sourceName: '' }
  formRef.value?.resetFields()
  uploadRef.value?.clearFiles()
}

// 重置上传状态
const resetUpload = () => {
  uploadResult.value = null
  previewResult.value = null
}
</script>

<style lang="scss" scoped>
.upload-page {
  .upload-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
  }

  .source-form {
    width: 100%;
    max-width: 600px;
    margin-bottom: 8px;
  }

  .upload-dragger {
    width: 100%;
    max-width: 600px;
    
    :deep(.el-upload-dragger) {
      width: 100%;
      padding: 40px;
    }
  }

  .upload-actions {
    margin-top: 20px;
    display: flex;
    gap: 12px;
  }

  .preview-content {
    margin-top: 16px;
  }

  .chunks-preview {
    margin-top: 20px;
    
    .chunks-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 500;
      color: #303133;
      margin-bottom: 12px;
    }
    
    .chunk-title {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .chunk-chapter {
        color: #606266;
        font-size: 13px;
      }
    }
    
    .chunk-content {
      .chunk-text {
        margin-top: 12px;
        padding: 12px;
        background: #f5f7fa;
        border-radius: 6px;
        font-size: 14px;
        line-height: 1.8;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
      }
    }
    
    .chunks-tip {
      margin-top: 12px;
      text-align: center;
    }
  }

  .raw-data {
    margin-top: 20px;
    
    .raw-json {
      background: #f5f7fa;
      padding: 16px;
      border-radius: 6px;
      font-size: 12px;
      overflow-x: auto;
      max-height: 400px;
    }
  }

  .upload-detail {
    margin-top: 20px;

    .result-table {
      margin-top: 16px;
    }
  }
}

@media (max-width: 768px) {
  .upload-page {
    .source-form {
      :deep(.el-form-item__label) {
        width: auto !important;
      }

      :deep(.el-form-item) {
        margin-bottom: 14px;
      }
    }

    .upload-dragger {
      :deep(.el-upload-dragger) {
        padding: 20px 12px;
      }
    }

    .upload-actions {
      width: 100%;
      flex-wrap: wrap;
      gap: 8px;

      .el-button {
        flex: 1 1 calc(50% - 4px);
        min-width: 0;
      }
    }

    .chunks-preview {
      .chunk-title {
        max-width: 100%;
        overflow: hidden;
      }
    }

    .raw-data .raw-json {
      padding: 10px;
      font-size: 11px;
      max-height: 260px;
    }
  }
}
</style>
