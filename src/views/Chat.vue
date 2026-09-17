<template>
  <div class="chat-page">
    <div class="chat-main">
      <div class="conversation-toolbar">
        <div>
          <strong>Agentic RAG 法律咨询</strong>
          <span>支持上下文追问与动态检索路由</span>
        </div>
        <el-button :icon="Plus" :disabled="isLoading" @click="startNewConversation">
          新建会话
        </el-button>
      </div>
      <div class="chat-messages" ref="messagesContainer" @scroll="onMessagesScroll">
        <div class="messages-wrapper">
          <!-- 欢迎消息 -->
          <div class="welcome-message" v-if="messages.length === 0">
            <el-icon :size="60" color="#409eff">
              <Reading />
            </el-icon>
            <h2>法律专业知识咨询</h2>
            <p>基于法律知识库的智能问答系统，请咨询专业的法律问题。</p>
            <div class="quick-questions">
              <div class="quick-title">您可以尝试问我：</div>
              <el-tag
                v-for="(question, index) in lawQuickQuestions"
                :key="index"
                class="quick-tag"
                @click="useQuickQuestion(question)"
              >
                {{ question }}
              </el-tag>
            </div>
          </div>

          <!-- 消息列表 -->
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="message-item"
            :class="message.role"
          >
            <div class="message-avatar">
              <el-avatar v-if="message.role === 'user'" :icon="User" />
              <el-avatar v-else :icon="Reading" style="background: #409eff" />
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-role">
                  {{ message.role === 'user' ? '我' : '法律顾问' }}
                </span>
                <span class="message-time">{{ message.time }}</span>
              </div>
              <div
                v-if="message.role === 'assistant' && message.agentTrace?.length"
                class="agent-trace"
                :class="{ completed: message.traceCompleted }"
              >
                <button class="agent-trace-header" type="button" @click="toggleTrace(message)">
                  <span class="agent-trace-heading">
                    <el-icon v-if="!message.traceCompleted" class="trace-spinner"><Loading /></el-icon>
                    <el-icon v-else class="trace-complete-icon"><CircleCheck /></el-icon>
                    <strong>{{ message.traceCompleted ? 'Agent 已完成分析' : 'Agent 正在执行' }}</strong>
                  </span>
                  <span class="agent-trace-summary">
                    {{ completedTraceCount(message) }} 个步骤
                    <template v-if="message.traceDurationMs">
                      · {{ formatDuration(message.traceDurationMs) }}
                    </template>
                    <el-icon class="trace-chevron" :class="{ expanded: message.traceExpanded }">
                      <ArrowDown />
                    </el-icon>
                  </span>
                </button>
                <div v-show="message.traceExpanded" class="agent-trace-body">
                  <div
                    v-for="(trace, traceIndex) in message.agentTrace"
                    :key="`${trace.stage}-${traceIndex}`"
                    class="trace-step"
                    :class="trace.status"
                  >
                    <div class="trace-rail">
                      <span class="trace-dot"></span>
                      <span v-if="traceIndex < message.agentTrace.length - 1" class="trace-line"></span>
                    </div>
                    <div class="trace-content">
                      <div class="trace-title-row">
                        <el-tag size="small" effect="plain" :type="traceTagType(trace.stage)">
                          {{ traceStageLabel(trace.stage) }}
                        </el-tag>
                        <strong>{{ trace.title }}</strong>
                        <span v-if="trace.durationMs" class="trace-duration">
                          {{ formatDuration(trace.durationMs) }}
                        </span>
                      </div>
                      <p>{{ trace.summary }}</p>
                      <ul v-if="trace.details?.length">
                        <li v-for="detail in trace.details" :key="detail">{{ detail }}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div class="message-text markdown-body" v-html="renderMarkdown(message.content)"></div>
              
              <div class="message-actions" v-if="message.role === 'assistant' && !message.loading">
                <el-button type="primary" link size="small" @click="copyMessage(message.content)">
                  <el-icon><DocumentCopy /></el-icon>
                  复制
                </el-button>
                <el-button type="primary" link size="small" @click="regenerateMessage(index)">
                  <el-icon><Refresh /></el-icon>
                  重新生成
                </el-button>
              </div>
            </div>
          </div>

          <!-- 加载中状态 -->
          <div class="message-item assistant" v-if="isLoading && !hasStreamingMessage">
            <div class="message-avatar">
              <el-avatar :icon="Reading" style="background: #409eff" />
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-role">法律顾问</span>
              </div>
              <div class="message-text loading">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="chat-input">
        <div class="input-container">
          <el-input
            v-model="inputMessage"
            type="textarea"
            :rows="3"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="请输入您的法律问题..."
            @keydown.enter.exact="handleEnter"
            :disabled="isLoading"
          />
          <div class="input-actions">
            <div class="input-tips">
              <el-tag type="success" size="small">
                <el-icon><Reading /></el-icon>
                Agent 自动核验法律依据
              </el-tag>
            </div>
            <el-button
              type="primary"
              :loading="isLoading"
              :disabled="!inputMessage.trim()"
              @click="sendMessage"
            >
              <el-icon><Promotion /></el-icon>
              发送
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowDown,
  CircleCheck,
  DocumentCopy,
  Loading,
  Plus,
  Promotion,
  Reading,
  Refresh,
  User
} from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'

// 与 request.js 保持一致，SSE fetch 请求使用相同的 baseURL
const baseURL = '/api'
const conversationStorageKey = 'laws-rag-conversation-id'
const createConversationId = () => crypto.randomUUID?.()
  || `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`

// 创建 markdown-it 实例，启用所有功能
const md = new MarkdownIt({
  html: true,
  xhtmlOut: false,
  breaks: true,
  linkify: true,
  typographer: false
})

// 状态
const messages = ref([])
const conversationId = ref(sessionStorage.getItem(conversationStorageKey) || createConversationId())
sessionStorage.setItem(conversationStorageKey, conversationId.value)
const inputMessage = ref('')
const isLoading = ref(false)
const messagesContainer = ref(null)
const hasStreamingMessage = ref(false)
const currentStreamingIndex = ref(-1)
const userScrolledUp = ref(false)

// 法律咨询快捷问题
const lawQuickQuestions = [
  '劳动合同被违法解除，我能获得哪些赔偿？',
  '交通事故责任认定与赔偿标准是什么？',
  '离婚时夫妻共同财产如何分割？',
  '著作权侵权行为有哪些？如何维权？',
  '消费者购买到假冒伪劣商品可以要求几倍赔偿？',
  '专利被他人侵权后应该如何处理？',
  '个人所得税的起征点和税率是多少？',
  '企业合并是否需要经过反垄断审查？',
  '刑事案件中取保候审的条件有哪些？',
  '民事诉讼的诉讼时效一般是多长时间？'
]

// 渲染 Markdown
const renderMarkdown = (content) => {
  if (!content) return ''
  
  try {
    // 直接使用 markdown-it 渲染，它会自动处理换行和标题
    return md.render(content)
  } catch (e) {
    console.error('Markdown render error:', e)
    // 如果渲染失败，简单处理换行
    return content
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/\n/g, '<br>')
  }
}

// 发送消息
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return
  
  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''
  
  messages.value.push({
    role: 'user',
    content: userMessage,
    time: new Date().toLocaleString()
  })
  
  scrollToBottom(true)
  isLoading.value = true
  
  messages.value.push({
    role: 'assistant',
    content: '',
    agentDecision: null,
    agentTrace: [],
    traceExpanded: true,
    traceCompleted: false,
    traceDurationMs: 0,
    time: new Date().toLocaleString(),
    loading: true
  })
  
  currentStreamingIndex.value = messages.value.length - 1
  hasStreamingMessage.value = true
  
  try {
    const response = await fetch(`${baseURL}/chat/law/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        conversationId: conversationId.value,
        question: userMessage,
        topK: 5
      })
    })

    if (!response.ok) {
      throw new Error('HTTP error! status: ' + response.status)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // 处理剩余的 buffer
        if (buffer.trim()) {
          processSSEData(buffer)
        }
        break
      }

      const text = decoder.decode(value, { stream: true })
      buffer += text

      // 按双换行分割 SSE 消息
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        processSSEData(part)
      }
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    if (currentStreamingIndex.value >= 0 && !messages.value[currentStreamingIndex.value].content) {
      messages.value[currentStreamingIndex.value].content = '抱歉，服务暂时不可用，请稍后重试。'
    }
  } finally {
    if (currentStreamingIndex.value >= 0) {
      messages.value[currentStreamingIndex.value].loading = false
    }
    hasStreamingMessage.value = false
    isLoading.value = false
    currentStreamingIndex.value = -1
    scrollToBottom()
  }
}

// 处理 SSE 数据
const processSSEData = (data) => {
  if (!data || currentStreamingIndex.value < 0) return
  
  // 按行处理
  const lines = data.split('\n')
  const eventLine = lines.find(line => line.startsWith('event:'))
  const eventName = eventLine ? eventLine.slice(6).trim() : 'content'
  // 收集所有 data 行的内容，用换行符连接以恢复原始 Markdown 格式
  const dataLines = []
  
  for (const line of lines) {
    // 跳过 event 行
    if (line.startsWith('event:')) {
      continue
    }
    
    // 处理 data 行
    if (line.startsWith('data:')) {
      const content = line.slice(5)
      dataLines.push(content)
    }
  }
  
  if (dataLines.length > 0) {
    // 用换行符连接多个 data 行，恢复原始内容的换行
    const content = dataLines.join('\n')
    if (eventName === 'trace') {
      try {
        const trace = JSON.parse(content)
        upsertTrace(messages.value[currentStreamingIndex.value], trace)
        scrollToBottom()
      } catch (error) {
        console.error('解析Agent执行轨迹失败:', error)
      }
    } else if (eventName === 'agent') {
      try {
        const metadata = JSON.parse(content)
        if (metadata.conversationId) {
          conversationId.value = metadata.conversationId
          sessionStorage.setItem(conversationStorageKey, conversationId.value)
        }
        messages.value[currentStreamingIndex.value].agentDecision = metadata.decision || null
        scrollToBottom()
      } catch (error) {
        console.error('解析Agent路由事件失败:', error)
      }
    } else if (eventName === 'done') {
      try {
        const doneData = JSON.parse(content)
        const message = messages.value[currentStreamingIndex.value]
        message.traceCompleted = true
        message.traceExpanded = false
        message.traceDurationMs = doneData.durationMs || 0
        message.agentTrace = message.agentTrace.map(trace => (
          trace.status === 'running' ? { ...trace, status: 'completed' } : trace
        ))
        if (doneData.conversationId) {
          conversationId.value = doneData.conversationId
          sessionStorage.setItem(conversationStorageKey, conversationId.value)
        }
        scrollToBottom()
      } catch (error) {
        console.error('解析Agent完成事件失败:', error)
      }
    } else if (eventName === 'error') {
      try {
        const errorData = JSON.parse(content)
        const message = messages.value[currentStreamingIndex.value]
        message.content = errorData.message || '请求失败'
        message.traceExpanded = true
        message.agentTrace = message.agentTrace.map(trace => (
          trace.status === 'running' ? { ...trace, status: 'error' } : trace
        ))
      } catch {
        messages.value[currentStreamingIndex.value].content = content
      }
    } else if (content) {
      messages.value[currentStreamingIndex.value].content += content
      scrollToBottom()
    }
  }
}

const handleEnter = (e) => {
  if (e.shiftKey) return
  e.preventDefault()
  sendMessage()
}

const useQuickQuestion = (question) => {
  inputMessage.value = question
  sendMessage()
}

const copyMessage = async (content) => {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败')
  }
}

const regenerateMessage = async (index) => {
  let userMessageIndex = index - 1
  while (userMessageIndex >= 0 && messages.value[userMessageIndex].role !== 'user') {
    userMessageIndex--
  }
  if (userMessageIndex < 0) return
  const userMessage = messages.value[userMessageIndex].content
  messages.value = messages.value.slice(0, index)
  inputMessage.value = userMessage
  await sendMessage()
}

// 判断是否在底部附近（距离底部 100px 以内视为在底部）
const isNearBottom = () => {
  if (!messagesContainer.value) return true
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  return scrollHeight - scrollTop - clientHeight < 100
}

// 监听用户滚动行为
const onMessagesScroll = () => {
  if (!messagesContainer.value) return
  userScrolledUp.value = !isNearBottom()
}

const scrollToBottom = (force = false) => {
  if (!force && userScrolledUp.value) return
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      userScrolledUp.value = false
    }
  })
}

const upsertTrace = (message, trace) => {
  if (!message || !trace?.stage) return
  const traceIdentity = item => [
    item.stage,
    item.metadata?.subQuestionId || '',
    item.metadata?.supplemental === true ? 'supplemental' : 'initial',
    item.metadata?.queryIndex || ''
  ].join(':')
  const existingIndex = message.agentTrace.findIndex(
    item => traceIdentity(item) === traceIdentity(trace)
  )
  if (existingIndex >= 0) {
    message.agentTrace.splice(existingIndex, 1, trace)
  } else {
    message.agentTrace.push(trace)
  }
  message.traceExpanded = true
}

const toggleTrace = (message) => {
  message.traceExpanded = !message.traceExpanded
}

const completedTraceCount = (message) => message.agentTrace
  .filter(trace => trace.status === 'completed').length

const formatDuration = (durationMs) => {
  if (!durationMs) return ''
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 1 : 2)}s`
}

const traceStageLabel = (stage) => ({
  ROUTING: '路由',
  QUESTION_DECOMPOSITION: '规划',
  SUBQUESTION_RETRIEVAL: '分项检索',
  INITIAL_DRAFT: '初稿',
  ANSWER_AUDIT: '检查',
  GAP_RETRIEVAL: '补查',
  TOOL_DECISION: '工具规划',
  OFFICIAL_WEB_SEARCH: '官方搜索',
  SOURCE_VALIDATION: '来源校验',
  QUERY_REWRITE: '改写',
  KEYWORD_ANALYSIS: 'BM25',
  HYBRID_RETRIEVAL: '召回',
  RERANK: '重排',
  EVIDENCE: '依据',
  GENERATION: '生成'
}[stage] || stage)

const traceTagType = (stage) => ({
  ROUTING: 'primary',
  QUESTION_DECOMPOSITION: 'primary',
  SUBQUESTION_RETRIEVAL: 'success',
  INITIAL_DRAFT: 'info',
  ANSWER_AUDIT: 'warning',
  GAP_RETRIEVAL: 'success',
  TOOL_DECISION: 'warning',
  OFFICIAL_WEB_SEARCH: 'primary',
  SOURCE_VALIDATION: 'success',
  QUERY_REWRITE: 'info',
  KEYWORD_ANALYSIS: 'warning',
  HYBRID_RETRIEVAL: 'success',
  RERANK: 'success',
  EVIDENCE: 'primary',
  GENERATION: 'info'
}[stage] || 'info')

const startNewConversation = () => {
  conversationId.value = createConversationId()
  sessionStorage.setItem(conversationStorageKey, conversationId.value)
  messages.value = []
  inputMessage.value = ''
  ElMessage.success('已开始新的法律咨询会话')
}
</script>

<style lang="scss" scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 40px);
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.chat-tabs {
  display: flex;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  
  .tab-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.3s;
    color: #606266;
    font-size: 14px;
    
    &:hover {
      color: #409eff;
    }
    
    &.active {
      color: #409eff;
      border-bottom-color: #409eff;
      font-weight: 500;
    }
    
    .tab-tag {
      margin-left: 4px;
    }
  }
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.conversation-toolbar {
  min-height: 58px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;

  > div {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  strong {
    color: #303133;
    font-size: 16px;
  }

  span {
    color: #909399;
    font-size: 12px;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.messages-wrapper {
  max-width: 900px;
  margin: 0 auto;
}

.welcome-message {
  text-align: center;
  padding: 60px 20px;
  
  h2 {
    margin: 20px 0 10px;
    color: #303133;
  }
  
  p {
    color: #606266;
    margin-bottom: 30px;
  }
}

.quick-title {
  font-size: 14px;
  color: #909399;
  margin-bottom: 16px;
}

.quick-tag {
  margin: 4px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: #409eff;
    color: #fff;
  }
}

.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  
  &.user {
    flex-direction: row-reverse;
    
    .message-content {
      align-items: flex-end;
    }
    
    .message-text {
      background: #409eff;
      color: #fff;
    }
  }
  
  &.assistant {
    .message-content {
      max-width: 85%;
    }
    
    .message-text {
      background: #f5f7fa;
    }
  }
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.message-role {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.message-time {
  font-size: 12px;
  color: #909399;
}

.message-text {
  padding: 16px 20px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.8;
  word-wrap: break-word;
  overflow-wrap: break-word;
  
  &.loading {
    display: flex;
    gap: 4px;
    padding: 16px 20px;
  }
}

// Markdown 样式 - 更完整的样式
.markdown-body {
  :deep(h1) {
    font-size: 1.5em;
    font-weight: 600;
    margin: 24px 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e4e7ed;
    line-height: 1.4;
    
    &:first-child {
      margin-top: 0;
    }
  }
  
  :deep(h2) {
    font-size: 1.3em;
    font-weight: 600;
    margin: 20px 0 12px;
    line-height: 1.4;
    color: #303133;
    
    &:first-child {
      margin-top: 0;
    }
  }
  
  :deep(h3) {
    font-size: 1.15em;
    font-weight: 600;
    margin: 16px 0 10px;
    line-height: 1.4;
    
    &:first-child {
      margin-top: 0;
    }
  }
  
  :deep(h4) {
    font-size: 1em;
    font-weight: 600;
    margin: 14px 0 8px;
    line-height: 1.4;
    
    &:first-child {
      margin-top: 0;
    }
  }
  
  :deep(h5), :deep(h6) {
    font-size: 0.95em;
    font-weight: 600;
    margin: 12px 0 8px;
    line-height: 1.4;
    
    &:first-child {
      margin-top: 0;
    }
  }
  
  :deep(p) {
    margin: 12px 0;
    line-height: 1.8;
    
    &:first-child {
      margin-top: 0;
    }
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  :deep(ul), :deep(ol) {
    margin: 12px 0;
    padding-left: 28px;
    
    li {
      margin: 6px 0;
      line-height: 1.7;
      
      > ul, > ol {
        margin: 4px 0;
      }
    }
  }
  
  :deep(ul) {
    list-style-type: disc;
    
    ul {
      list-style-type: circle;
    }
  }
  
  :deep(ol) {
    list-style-type: decimal;
  }
  
  :deep(code) {
    background: rgba(0, 0, 0, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
  }
  
  :deep(pre) {
    background: #282c34;
    color: #abb2bf;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 16px 0;
    
    code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-size: 13px;
      line-height: 1.6;
    }
  }
  
  :deep(blockquote) {
    margin: 16px 0;
    padding: 12px 20px;
    border-left: 4px solid #409eff;
    background: rgba(64, 158, 255, 0.08);
    color: #606266;
    border-radius: 0 8px 8px 0;
    
    p {
      margin: 0;
      line-height: 1.7;
    }
  }
  
  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    display: block;
    overflow-x: auto;
    white-space: nowrap;
    
    th, td {
      border: 1px solid #e4e7ed;
      padding: 10px 14px;
      text-align: left;
      white-space: normal;
    }
    
    th {
      background: #f5f7fa;
      font-weight: 600;
      color: #303133;
    }
    
    tr:nth-child(even) {
      background: #fafafa;
    }
    
    tr:hover {
      background: #f0f7ff;
    }
  }
  
  :deep(hr) {
    border: none;
    border-top: 2px solid #e4e7ed;
    margin: 24px 0;
  }
  
  :deep(a) {
    color: #409eff;
    text-decoration: none;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  :deep(strong) {
    font-weight: 600;
    color: #303133;
  }
  
  :deep(em) {
    font-style: italic;
  }
  
  :deep(br) {
    content: "";
    display: block;
    margin-bottom: 8px;
  }
}

// 用户消息样式
.message-item.user .markdown-body {
  :deep(code) {
    background: rgba(255, 255, 255, 0.2);
  }
  
  :deep(pre) {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    
    code {
      color: #fff;
    }
  }
  
  :deep(blockquote) {
    background: rgba(255, 255, 255, 0.1);
    border-left-color: rgba(255, 255, 255, 0.5);
    color: rgba(255, 255, 255, 0.9);
  }
  
  :deep(a) {
    color: #fff;
    text-decoration: underline;
  }
  
  :deep(strong) {
    color: #fff;
  }
  
  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    color: #fff;
    border-bottom-color: rgba(255, 255, 255, 0.3);
  }
}

.dot {
  width: 8px;
  height: 8px;
  background: #409eff;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
  
  &:nth-child(1) {
    animation-delay: -0.32s;
  }
  
  &:nth-child(2) {
    animation-delay: -0.16s;
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.message-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.chat-input {
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}

.input-container {
  max-width: 900px;
  margin: 0 auto;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.input-tips {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 8px;

  .web-search-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
}

.agent-trace {
  margin-bottom: 10px;
  border: 1px solid #d9ecff;
  border-radius: 7px;
  background: #f5faff;
  overflow: hidden;

  &.completed {
    border-color: #dcdfe6;
    background: #fafafa;
  }
}

.agent-trace-header {
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  background: transparent;
  color: #303133;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(64, 158, 255, 0.05);
  }
}

.agent-trace-heading,
.agent-trace-summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}

.agent-trace-heading {
  min-width: 0;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-trace-summary {
  flex-shrink: 0;
  color: #909399;
}

.trace-spinner {
  color: #409eff;
  animation: trace-rotate 1s linear infinite;
}

.trace-complete-icon {
  color: #67c23a;
}

.trace-chevron {
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(180deg);
  }
}

.agent-trace-body {
  padding: 3px 12px 12px;
  border-top: 1px solid rgba(64, 158, 255, 0.12);
}

.trace-step {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  column-gap: 9px;
  color: #606266;

  &.running .trace-dot {
    border-color: #409eff;
    background: #409eff;
    box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
  }

  &.error .trace-dot {
    border-color: #f56c6c;
    background: #f56c6c;
  }
}

.trace-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.trace-dot {
  z-index: 1;
  width: 8px;
  height: 8px;
  margin-top: 16px;
  border: 2px solid #67c23a;
  border-radius: 50%;
  background: #fff;
}

.trace-line {
  position: absolute;
  top: 24px;
  bottom: -16px;
  width: 1px;
  background: #dcdfe6;
}

.trace-content {
  min-width: 0;
  padding: 9px 0 7px;

  p {
    margin: 5px 0 0;
    color: #606266;
    font-size: 12px;
    line-height: 1.6;
  }

  ul {
    margin: 5px 0 0;
    padding-left: 17px;
    color: #909399;
    font-size: 12px;
    line-height: 1.6;
  }
}

.trace-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12px;

  strong {
    overflow: hidden;
    color: #303133;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.trace-duration {
  margin-left: auto;
  color: #a8abb2;
  font-variant-numeric: tabular-nums;
}

@keyframes trace-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .chat-page {
    height: calc(100dvh - 68px);
    border-radius: 6px;
  }

  .chat-tabs {
    padding: 0 10px;

    .tab-item {
      padding: 12px 10px;
      font-size: 13px;
      gap: 6px;
    }
  }

  .chat-messages {
    padding: 10px;
  }

  .conversation-toolbar {
    min-height: 52px;
    padding: 0 10px;

    > div span {
      display: none;
    }

    strong {
      font-size: 14px;
    }
  }

  .welcome-message {
    padding: 24px 8px;

    h2 {
      margin-top: 12px;
      font-size: 18px;
    }

    p {
      margin-bottom: 16px;
      font-size: 13px;
    }
  }

  .message-item {
    margin-bottom: 14px;
  }

  .message-content {
    max-width: 88%;
  }

  .message-item.assistant .message-content {
    max-width: 88%;
  }

  .message-text {
    padding: 12px;
    font-size: 13px;
    line-height: 1.7;

    &.loading {
      padding: 12px;
    }
  }

  .message-header {
    margin-bottom: 4px;
  }

  .message-time {
    display: none;
  }

  .chat-input {
    padding: 10px;
  }

  .input-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .input-tips {
    width: 100%;
    flex-wrap: wrap;
    font-size: 11px;
  }
}
</style>
