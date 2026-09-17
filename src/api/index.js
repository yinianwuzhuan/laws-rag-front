import request from './request'

// 统一走 /api 前缀，与 request.js 保持一致
const baseURL = '/api'

/**
 * 法律文档相关接口
 */
export const lawApi = {

  /**
   * 获取来源类型枚举列表
   * @returns {Promise}
   */
  getSourceTypes: () => {
    return request.get('/law/source-types')
  },

  /**
   * 文档上传预览
   * @param {File} file - 要预览的文件
   * @param {string} sourceType - 来源类型
   * @param {string} sourceName - 来源名称
   * @param {Function} onProgress - 上传进度回调
   * @returns {Promise}
   */
  preview: (file, sourceType, sourceName, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.post('/law/preview', formData, {
      params: { sourceType, sourceName },
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      }
    })
  },

  /**
   * 文档上传并入库
   * @param {File} file - 要上传的文件
   * @param {string} sourceType - 来源类型
   * @param {string} sourceName - 来源名称
   * @param {Function} onProgress - 上传进度回调
   * @returns {Promise}
   */
  upload: (file, sourceType, sourceName, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.post('/law/upload', formData, {
      params: { sourceType, sourceName },
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      }
    })
  },

  /**
   * 批量上传文档并入库。所有文件共用同一来源类型和来源名称。
   * @param {File[]} files - 要上传的文件
   * @param {string} sourceType - 来源类型
   * @param {string} sourceName - 来源名称
   * @param {Function} onProgress - 整个批次的上传进度回调
   * @returns {Promise}
   */
  uploadBatch: (files, sourceType, sourceName, onProgress) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    return request.post('/law/upload/batch', formData, {
      params: { sourceType, sourceName },
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      }
    })
  },

  /**
   * 向量化匹配查询
   * @param {Object} params - 查询参数
   * @returns {Promise}
   */
  search: (params) => {
    return request.get('/law/search', { params })
  },

  /** 获取自由检索支持的能力，例如本地 Reranker 是否可用 */
  getSearchCapabilities: () => {
    return request.get('/law/search/capabilities')
  }
}

/**
 * 聊天相关接口
 */
export const chatApi = {
  /**
   * 通用流式聊天接口
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 收到消息时的回调
   * @returns {Promise}
   */
  chatStream: async (message, onChunk) => {
    const response = await fetch(`${baseURL}/chat/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ message })
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
        if (buffer.trim()) {
          processSSEData(buffer, onChunk)
        }
        break
      }

      const text = decoder.decode(value, { stream: true })
      buffer += text

      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        processSSEData(part, onChunk)
      }
    }
  },

  /**
   * 法律专业知识咨询接口（RAG）
   * @param {string} question - 用户问题
   * @param {number} topK - 返回数量
   * @param {Function} onChunk - 收到消息时的回调
   * @returns {Promise}
   */
  lawChatStream: async (question, topK = 5, onChunk) => {
    const response = await fetch(`${baseURL}/chat/law/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ question, topK })
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
        if (buffer.trim()) {
          processSSEData(buffer, onChunk)
        }
        break
      }

      const text = decoder.decode(value, { stream: true })
      buffer += text

      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        processSSEData(part, onChunk)
      }
    }
  }
}

/**
 * RAG 评测相关接口
 */
export const evaluationApi = {
  getDataset: () => request.get('/evaluation/dataset'),
  getDatasets: () => request.get('/evaluation/datasets'),

  /**
   * 运行检索评测并逐条消费 SSE 事件。
   */
  runRetrieval: async ({ datasetId, split = 'all', retrievalMode = 'dense', queryRewrite = false, topK = 5, candidateTopK = 10, rerank = false }, onEvent, signal) => {
    const params = new URLSearchParams({
      datasetId,
      split,
      retrievalMode,
      queryRewrite: String(queryRewrite),
      topK: String(topK),
      candidateTopK: String(candidateTopK),
      rerank: String(rerank)
    })
    const response = await fetch(`${baseURL}/evaluation/retrieval/stream?${params}`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal
    })

    if (!response.ok) {
      throw new Error(`评测请求失败，HTTP ${response.status}`)
    }
    if (!response.body) {
      throw new Error('浏览器未收到评测数据流')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const processBlock = (block) => {
      let eventName = 'message'
      const dataLines = []
      for (const rawLine of block.split(/\r?\n/)) {
        if (rawLine.startsWith('event:')) {
          eventName = rawLine.slice(6).trim()
        } else if (rawLine.startsWith('data:')) {
          dataLines.push(rawLine.slice(5).trimStart())
        }
      }
      if (dataLines.length === 0) return
      const text = dataLines.join('\n')
      let data = text
      try {
        data = JSON.parse(text)
      } catch (_) {
        // 服务端错误场景可能返回普通文本，保留原始内容便于页面提示。
      }
      onEvent?.(eventName, data)
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      blocks.forEach(processBlock)
    }
    buffer += decoder.decode()
    if (buffer.trim()) processBlock(buffer)
  },

  /**
   * 运行双路生成评测：黄金上下文生成 + 实际检索上下文生成 + 独立 Judge。
   */
  runGeneration: async ({ datasetId, split = 'dev', limit = 5, retrievalMode = 'hybrid', queryRewrite = true, topK = 5, candidateTopK = 10, rerank = true }, onEvent, signal) => {
    const params = new URLSearchParams({
      datasetId,
      split,
      limit: String(limit),
      retrievalMode,
      queryRewrite: String(queryRewrite),
      topK: String(topK),
      candidateTopK: String(candidateTopK),
      rerank: String(rerank)
    })
    await consumeEvaluationStream(
      `${baseURL}/evaluation/generation/stream?${params}`,
      onEvent,
      signal,
      '生成评测'
    )
  }
}

async function consumeEvaluationStream(url, onEvent, signal, label) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal
  })
  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch (_) { /* ignore */ }
    throw new Error(`${label}请求失败，HTTP ${response.status}${detail ? `：${detail}` : ''}`)
  }
  if (!response.body) throw new Error(`浏览器未收到${label}数据流`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const processBlock = (block) => {
    let eventName = 'message'
    const dataLines = []
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith('event:')) eventName = rawLine.slice(6).trim()
      else if (rawLine.startsWith('data:')) dataLines.push(rawLine.slice(5).trimStart())
    }
    if (!dataLines.length) return
    const text = dataLines.join('\n')
    let data = text
    try { data = JSON.parse(text) } catch (_) { /* 保留服务端普通文本 */ }
    onEvent?.(eventName, data)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(processBlock)
  }
  buffer += decoder.decode()
  if (buffer.trim()) processBlock(buffer)
}

// 处理 SSE 数据
function processSSEData(data, onChunk) {
  if (!data || !onChunk) return
  
  const lines = data.split('\n')
  const dataLines = []
  
  for (const line of lines) {
    if (line.startsWith('event:')) {
      continue
    } else if (line.startsWith('data:')) {
      const content = line.slice(5)
      dataLines.push(content)
    }
  }
  
  if (dataLines.length > 0) {
    const content = dataLines.join('\n')
    if (content) {
      onChunk(content)
    }
  }
}

export default {
  lawApi,
  chatApi,
  evaluationApi
}
