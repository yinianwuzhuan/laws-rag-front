<template>
  <div class="query-page">
    <div class="page-card">
      <div class="page-title">
        <el-icon><Search /></el-icon>
        <span>自由检索测评</span>
      </div>
      
      <div class="query-form">
        <el-form :model="queryForm" label-width="100px">
          <el-form-item label="查询内容" required>
            <el-input
              v-model="queryForm.query"
              type="textarea"
              :rows="4"
              placeholder="请输入任意法律问题，查看系统最终检索到的相关法条"
            />
          </el-form-item>
          
          <el-form-item label="召回方式">
            <el-radio-group v-model="queryForm.retrievalMode">
              <el-radio-button value="dense">Dense 向量</el-radio-button>
              <el-radio-button value="bm25">BM25</el-radio-button>
              <el-radio-button value="hybrid">Hybrid RRF</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="二阶段重排">
            <el-switch
              v-model="queryForm.rerank"
              :disabled="!rerankerAvailable"
              active-text="开启 Reranker"
              inactive-text="不重排"
            />
          </el-form-item>

          <el-form-item label="问题重写">
            <el-switch
              v-model="queryForm.queryRewrite"
              :disabled="!queryRewriteAvailable"
              active-text="原问题 + 通义重写"
              inactive-text="仅原问题"
            />
            <span class="control-tip">
              {{ queryForm.retrievalMode === 'hybrid'
                ? '原/重写 × Dense/BM25，Qdrant四路RRF'
                : '原问题与重写问题，Qdrant双路RRF' }}
            </span>
          </el-form-item>

          <el-alert
            v-if="!rerankerAvailable"
            title="当前后端未加载 Reranker。三种召回方式仍可使用，但不能进行二阶段重排。"
            type="warning"
            :closable="false"
            show-icon
            class="reranker-alert"
          />

          <el-form-item v-if="queryForm.rerank" label="候选 TopK">
            <el-input-number
              v-model="queryForm.candidateTopK"
              :min="queryForm.topK"
              :max="100"
              :step="1"
            />
            <span class="control-tip">先按所选方式召回候选，再交给 Reranker 重新排序</span>
          </el-form-item>

          <el-form-item :label="queryForm.rerank ? '最终 TopK' : '返回 TopK'">
            <el-input-number
              v-model="queryForm.topK"
              :min="1"
              :max="50"
              :step="1"
            />
            <span v-if="queryForm.rerank" class="control-tip">重排后进入最终结果的条数</span>
          </el-form-item>

          <el-divider content-position="left">
            <el-button type="primary" link @click="showAdvanced = !showAdvanced">
              <el-icon><component :is="showAdvanced ? 'ArrowUp' : 'ArrowDown'" /></el-icon>
              {{ showAdvanced ? '收起筛选条件' : '展开筛选条件' }}
            </el-button>
          </el-divider>

          <!-- 高级筛选条件 -->
          <el-collapse-transition>
            <div v-show="showAdvanced" class="advanced-filters">
              <el-row :gutter="20">
                <el-col :xs="24" :sm="12">
                  <el-form-item label="来源类型">
                    <el-select
                      v-model="queryForm.source_type"
                      multiple
                      collapse-tags
                      collapse-tags-tooltip
                      placeholder="可多选，不选则不限"
                      :loading="sourceTypesLoading"
                      clearable
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
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item label="来源名称">
                    <el-input
                      v-model="queryForm.source_name"
                      placeholder="来源名称"
                      clearable
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :xs="24" :sm="12">
                  <el-form-item label="书名">
                    <el-input
                      v-model="queryForm.book"
                      placeholder="如：民法典、刑法等"
                      clearable
                    />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item label="编">
                    <el-input
                      v-model="queryForm.part"
                      placeholder="如：总则、分则等"
                      clearable
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :xs="24" :sm="12">
                  <el-form-item label="章">
                    <el-input
                      v-model="queryForm.chapter"
                      placeholder="章节名称"
                      clearable
                    />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item label="节">
                    <el-input
                      v-model="queryForm.section"
                      placeholder="小节名称"
                      clearable
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :xs="24" :sm="12">
                  <el-form-item label="条文号">
                    <el-input
                      v-model="queryForm.article_no"
                      placeholder="如：第一条、第二条"
                      clearable
                    />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="12">
                  <el-form-item label="条文号(数字)">
                    <el-input
                      v-model="queryForm.article_no_arabic"
                      placeholder="如：1、2、3"
                      clearable
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="业务ID">
                <el-input
                  v-model="queryForm.business_id"
                  placeholder="业务标识ID"
                  clearable
                />
              </el-form-item>
            </div>
          </el-collapse-transition>
          
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="handleQuery">
              <el-icon><Search /></el-icon>
              开始查询
            </el-button>
            <el-button @click="handleReset">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 单题检索实验结果 -->
    <div class="page-card" v-if="searchTrace && vectorCandidates.length > 0">
      <div class="page-title">
        <el-icon><Document /></el-icon>
        <span>单题检索结果</span>
        <el-tag :type="searchTrace.rerank ? 'success' : 'info'" class="mode-tag">
          {{ traceModeText(searchTrace) }}
        </el-tag>
      </div>

      <div class="query-snapshot">
        <span class="snapshot-label">原始问题</span>
        <span>{{ searchTrace.query }}</span>
      </div>
      <div v-if="searchTrace.rewriteChanged" class="query-snapshot rewritten-snapshot">
        <span class="snapshot-label">通义重写</span>
        <span>{{ searchTrace.rewrittenQuery }}</span>
        <el-tag size="small" type="success">{{ searchTrace.rewriteDurationMs }}ms</el-tag>
      </div>
      <el-alert
        v-else-if="searchTrace.queryRewrite && searchTrace.rewriteFallback"
        title="问题重写调用失败，本次已自动降级为仅使用原问题检索"
        type="warning"
        :closable="false"
        show-icon
        class="rewrite-alert"
      />

      <div v-if="hasRetrievalHints" class="trace-block hint-plan">
        <h4>规则检索提示（不生成硬过滤）</h4>
        <div v-if="searchTrace.retrievalHints.lawNames?.length" class="hint-row">
          <span class="hint-label">明确法律</span>
          <el-tag v-for="item in searchTrace.retrievalHints.lawNames" :key="item" size="small">
            {{ item }}
          </el-tag>
        </div>
        <div v-if="searchTrace.retrievalHints.articleNumbers?.length" class="hint-row">
          <span class="hint-label">明确条号</span>
          <el-tag v-for="item in searchTrace.retrievalHints.articleNumbers" :key="item" size="small" type="warning">
            第{{ item }}条
          </el-tag>
        </div>
        <div v-if="searchTrace.retrievalHints.concepts?.length" class="hint-row">
          <span class="hint-label">法律概念</span>
          <el-tag v-for="item in searchTrace.retrievalHints.concepts" :key="item" size="small" type="success">
            {{ item }}
          </el-tag>
        </div>
        <div class="query-snapshot enhanced-bm25-snapshot">
          <span class="snapshot-label">增强BM25</span>
          <span>{{ searchTrace.retrievalHints.enhancedBm25Query }}</span>
        </div>
        <p class="hint-description">原问题召回仍然保留；以上词语只辅助BM25召回和Reranker相关性判断。</p>
      </div>

      <template v-if="searchTrace.rewriteChanged">
        <div v-for="channel in rewriteChannels" :key="channel.key" class="trace-block">
          <h4>{{ channel.title }}原始排名（{{ channel.rows.length }}条）</h4>
          <el-table :data="channel.rows" size="small" border>
            <el-table-column prop="vectorRank" label="排名" width="75" />
            <el-table-column label="法条" min-width="220">
              <template #default="scope">{{ scope.row.sourceName }} {{ scope.row.articleNo }}</template>
            </el-table-column>
            <el-table-column prop="businessId" label="Business ID" min-width="250" />
            <el-table-column label="检索分数" width="105">
              <template #default="scope">{{ formatScore(scope.row.vectorScore) }}</template>
            </el-table-column>
            <el-table-column label="法条完整内容" min-width="440">
              <template #default="scope"><div class="full-law-text">{{ scope.row.text }}</div></template>
            </el-table-column>
          </el-table>
        </div>
        <div class="trace-block stage-divider">
          <h4>{{ rrfStageTitle(searchTrace.retrievalMode) }}</h4>
          <p>以上原始通道作为同一次 Qdrant Query API 的 Prefetch，由 Qdrant 原生 RRF 直接生成下面的候选排名。</p>
        </div>
      </template>

      <template v-if="searchTrace.rerank">
        <div class="trace-block">
          <h4>重排前：{{ fusionResultTitle(searchTrace) }}（{{ vectorCandidates.length }}条）</h4>
          <el-table :data="vectorCandidates" size="small" border>
            <el-table-column prop="vectorRank" label="候选排名" width="90" />
            <el-table-column label="法条" min-width="220">
              <template #default="scope">{{ scope.row.sourceName }} {{ scope.row.articleNo }}</template>
            </el-table-column>
            <el-table-column prop="businessId" label="Business ID" min-width="250" />
            <el-table-column label="召回分数" width="105">
              <template #default="scope">{{ formatScore(scope.row.vectorScore) }}</template>
            </el-table-column>
            <el-table-column label="法条完整内容" min-width="440">
              <template #default="scope"><div class="full-law-text">{{ scope.row.text }}</div></template>
            </el-table-column>
          </el-table>
        </div>

        <div class="trace-block">
          <h4>重排后：完整排序（前{{ searchTrace.topK }}条进入最终结果）</h4>
          <el-table :data="rerankedCandidates" size="small" border>
            <el-table-column prop="rerankRank" label="重排排名" width="90" />
            <el-table-column prop="vectorRank" label="原候选排名" width="105" />
            <el-table-column label="名次变化" width="90">
              <template #default="scope">
                <span :class="rankMovement(scope.row).className">{{ rankMovement(scope.row).text }}</span>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.rerankRank <= searchTrace.topK ? 'success' : 'info'" size="small">
                  {{ scope.row.rerankRank <= searchTrace.topK ? '保留' : '淘汰' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="法条" min-width="220">
              <template #default="scope">{{ scope.row.sourceName }} {{ scope.row.articleNo }}</template>
            </el-table-column>
            <el-table-column prop="businessId" label="Business ID" min-width="250" />
            <el-table-column label="召回分数" width="105">
              <template #default="scope">{{ formatScore(scope.row.vectorScore) }}</template>
            </el-table-column>
            <el-table-column label="重排分数" width="105">
              <template #default="scope">{{ formatScore(scope.row.rerankScore) }}</template>
            </el-table-column>
            <el-table-column label="法条完整内容" min-width="440">
              <template #default="scope"><div class="full-law-text">{{ scope.row.text }}</div></template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <div v-else class="trace-block">
        <h4>{{ fusionResultTitle(searchTrace) }}（{{ vectorCandidates.length }}条）</h4>
        <el-table :data="vectorCandidates" size="small" border>
          <el-table-column prop="vectorRank" label="候选排名" width="90" />
          <el-table-column label="法条" min-width="220">
            <template #default="scope">{{ scope.row.sourceName }} {{ scope.row.articleNo }}</template>
          </el-table-column>
          <el-table-column prop="businessId" label="Business ID" min-width="250" />
          <el-table-column label="召回分数" width="105">
            <template #default="scope">{{ formatScore(scope.row.vectorScore) }}</template>
          </el-table-column>
          <el-table-column label="法条完整内容" min-width="440">
            <template #default="scope"><div class="full-law-text">{{ scope.row.text }}</div></template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="page-card empty-state" v-if="hasQueried && queryResults.length === 0 && !loading">
      <el-empty description="未找到相关内容">
        <template #image>
          <el-icon :size="80" color="#c0c4cc"><Search /></el-icon>
        </template>
      </el-empty>
    </div>

    <!-- 查询历史 -->
    <div class="page-card" v-if="queryHistory.length > 0">
      <div class="page-title">
        <el-icon><Clock /></el-icon>
        <span>查询历史</span>
        <el-button type="danger" link @click="clearHistory">
          <el-icon><Delete /></el-icon>
          清空历史
        </el-button>
      </div>
      
      <el-timeline>
        <el-timeline-item
          v-for="(item, index) in queryHistory"
          :key="index"
          :timestamp="item.time"
          placement="top"
        >
          <el-card shadow="hover" class="history-card" @click="useHistoryQuery(item)">
            <div class="history-query">{{ item.query }}</div>
            <div class="history-meta">
              <span>返回 {{ item.resultCount }} 条结果</span>
              <span>{{ historyModeText(item) }}</span>
              <span v-if="item.book">书名: {{ item.book }}</span>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lawApi } from '@/api'

const loading = ref(false)
const hasQueried = ref(false)
const showAdvanced = ref(false)
const rerankerAvailable = ref(false)
const queryRewriteAvailable = ref(false)

// 来源类型枚举
const sourceTypes = ref([])
const sourceTypesLoading = ref(false)

onMounted(async () => {
  sourceTypesLoading.value = true
  const [sourceTypeResult, capabilityResult] = await Promise.allSettled([
    lawApi.getSourceTypes(),
    lawApi.getSearchCapabilities()
  ])
  if (sourceTypeResult.status === 'fulfilled') {
    const data = sourceTypeResult.value.data || sourceTypeResult.value
    sourceTypes.value = data.data || data
  } else {
    console.error('加载来源类型失败:', sourceTypeResult.reason)
  }
  if (capabilityResult.status === 'fulfilled') {
    const data = capabilityResult.value.data || capabilityResult.value
    rerankerAvailable.value = Boolean(data.rerankerAvailable)
    queryRewriteAvailable.value = Boolean(data.queryRewriteAvailable)
  } else {
    console.error('加载检索能力失败:', capabilityResult.reason)
  }
  sourceTypesLoading.value = false
})

const queryForm = reactive({
  query: '',
  topK: 5,
  candidateTopK: 10,
  retrievalMode: 'dense',
  queryRewrite: false,
  rerank: false,
  source_type: [],
  source_name: '',
  book: '',
  part: '',
  chapter: '',
  section: '',
  article_no: '',
  article_no_arabic: '',
  business_id: ''
})

const queryResults = ref([])
const queryHistory = ref([])
const searchTrace = ref(null)

const vectorCandidates = computed(() => searchTrace.value?.vectorCandidates || [])
const rerankedCandidates = computed(() => searchTrace.value?.rerankedCandidates || [])
const hasRetrievalHints = computed(() => {
  const hints = searchTrace.value?.retrievalHints
  return Boolean(hints && (
    hints.lawNames?.length || hints.articleNumbers?.length || hints.concepts?.length
  ))
})
const rewriteChannels = computed(() => {
  const trace = searchTrace.value
  if (!trace?.rewriteChanged) return []
  const channels = []
  if (trace.retrievalMode !== 'bm25') {
    channels.push({ key: 'original-dense', title: '原问题 Dense', rows: trace.originalDenseCandidates || [] })
  }
  if (trace.retrievalMode !== 'dense') {
    channels.push({ key: 'original-bm25', title: '原问题 BM25', rows: trace.originalBm25Candidates || [] })
  }
  if (trace.retrievalMode !== 'bm25') {
    channels.push({ key: 'rewritten-dense', title: '重写问题 Dense', rows: trace.rewrittenDenseCandidates || [] })
  }
  if (trace.retrievalMode !== 'dense') {
    channels.push({ key: 'rewritten-bm25', title: '增强 BM25（基于重写问题）', rows: trace.rewrittenBm25Candidates || [] })
  }
  return channels
})

const normalizeCandidate = (item) => ({
  ...item,
  rank: item.rank,
  vectorRank: item.vector_rank ?? item.vectorRank ?? item.rank,
  vectorScore: item.vector_score ?? item.vectorScore ?? item.score,
  retrievalRank: item.retrieval_rank ?? item.retrievalRank ?? item.vector_rank ?? item.vectorRank ?? item.rank,
  retrievalScore: item.retrieval_score ?? item.retrievalScore ?? item.vector_score ?? item.vectorScore ?? item.score,
  denseRank: item.dense_rank ?? item.denseRank,
  denseScore: item.dense_score ?? item.denseScore,
  bm25Rank: item.bm25_rank ?? item.bm25Rank,
  bm25Score: item.bm25_score ?? item.bm25Score,
  fusionRank: item.fusion_rank ?? item.fusionRank,
  fusionScore: item.fusion_score ?? item.fusionScore,
  rerankRank: item.rerank_rank ?? item.rerankRank,
  rerankScore: item.rerank_score ?? item.rerankScore,
  rerankRawScore: item.rerank_raw_score ?? item.rerankRawScore,
  sourceName: item.source_name ?? item.sourceName,
  sourceType: item.source_type ?? item.sourceType,
  articleNo: item.article_no ?? item.articleNo,
  articleNoArabic: item.article_no_arabic ?? item.articleNoArabic,
  businessId: item.business_id ?? item.businessId,
  text: item.text ?? item.content ?? ''
})

const formatScore = (value) => value == null ? '—' : Number(value).toFixed(4)
const retrievalModeLabel = (mode) => ({
  dense: 'Dense 向量',
  bm25: 'BM25 关键词',
  hybrid: 'Hybrid RRF'
}[mode] || mode || 'Dense 向量')
const rrfStageTitle = (mode) => mode === 'hybrid'
  ? '四路 Qdrant RRF 融合'
  : '双路 Qdrant RRF 融合'
const fusionResultTitle = (trace) => trace.rewriteChanged
  ? `${rrfStageTitle(trace.retrievalMode)}候选`
  : `${retrievalModeLabel(trace.retrievalMode)}检索结果`
const traceModeText = (trace) => trace.rerank
  ? `${retrievalModeLabel(trace.retrievalMode)}${trace.queryRewrite ? ' + 问题重写' : ''} Top${trace.candidateTopK} → 重排 Top${trace.topK}`
  : `${retrievalModeLabel(trace.retrievalMode)}${trace.queryRewrite ? ' + 问题重写' : ''} Top${trace.topK}`
const historyModeText = (item) => traceModeText(item)
const rankMovement = (row) => {
  const movement = row.vectorRank - row.rerankRank
  if (movement > 0) return { text: `↑ ${movement}`, className: 'rank-up' }
  if (movement < 0) return { text: `↓ ${Math.abs(movement)}`, className: 'rank-down' }
  return { text: '—', className: 'rank-same' }
}

// 执行查询
const handleQuery = async () => {
  if (!queryForm.query.trim()) {
    ElMessage.warning('请输入查询内容')
    return
  }

  loading.value = true
  hasQueried.value = true
  
  try {
    // 构建查询参数，过滤空值
    const params = {
      query: queryForm.query,
      retrievalMode: queryForm.retrievalMode,
      queryRewrite: queryForm.queryRewrite,
      topK: queryForm.topK,
      candidateTopK: queryForm.rerank
        ? Math.max(queryForm.candidateTopK, queryForm.topK)
        : queryForm.topK,
      rerank: queryForm.rerank
    }
    
    // 添加可选筛选条件
    const optionalFields = ['source_name', 'book', 'part', 'chapter', 'section', 'article_no', 'article_no_arabic', 'business_id']
    optionalFields.forEach(field => {
      if (queryForm[field]) {
        params[field] = queryForm[field]
      }
    })

    // source_type 多选，逗号拼接
    if (queryForm.source_type.length > 0) {
      params.source_type = queryForm.source_type.join(',')
    }
    
    const res = await lawApi.search(params)

    const results = Array.isArray(res.results) ? res.results.map(normalizeCandidate) : []
    queryResults.value = results
    searchTrace.value = {
      query: res.query || queryForm.query,
      retrievalMode: res.retrievalMode || queryForm.retrievalMode,
      queryRewrite: Boolean(res.queryRewrite),
      rewrittenQuery: res.rewrittenQuery || queryForm.query,
      rewriteChanged: Boolean(res.rewrite?.changed),
      rewriteFallback: Boolean(res.rewrite?.fallback),
      rewriteDurationMs: res.rewrite?.durationMs || 0,
      retrievalHints: res.retrievalHints || {
        lawNames: [], articleNumbers: [], articleTokens: [], concepts: [], enhancedBm25Query: ''
      },
      topK: res.topK || queryForm.topK,
      candidateTopK: res.candidateTopK || params.candidateTopK,
      rerank: Boolean(res.rerank),
      vectorCandidates: Array.isArray(res.retrievalCandidates)
        ? res.retrievalCandidates.map(normalizeCandidate)
        : Array.isArray(res.vectorCandidates) ? res.vectorCandidates.map(normalizeCandidate) : results,
      denseCandidates: Array.isArray(res.vectorCandidates)
        ? res.vectorCandidates.map(normalizeCandidate) : [],
      bm25Candidates: Array.isArray(res.bm25Candidates)
        ? res.bm25Candidates.map(normalizeCandidate) : [],
      fusedCandidates: Array.isArray(res.fusedCandidates)
        ? res.fusedCandidates.map(normalizeCandidate) : [],
      originalDenseCandidates: Array.isArray(res.originalDenseCandidates)
        ? res.originalDenseCandidates.map(normalizeCandidate) : [],
      originalBm25Candidates: Array.isArray(res.originalBm25Candidates)
        ? res.originalBm25Candidates.map(normalizeCandidate) : [],
      rewrittenDenseCandidates: Array.isArray(res.rewrittenDenseCandidates)
        ? res.rewrittenDenseCandidates.map(normalizeCandidate) : [],
      rewrittenBm25Candidates: Array.isArray(res.rewrittenBm25Candidates)
        ? res.rewrittenBm25Candidates.map(normalizeCandidate) : [],
      rerankedCandidates: Array.isArray(res.rerankedCandidates)
        ? res.rerankedCandidates.map(normalizeCandidate) : [],
      results
    }
    
    // 添加到查询历史
    if (queryResults.value.length > 0) {
      queryHistory.value.unshift({
        query: queryForm.query,
        retrievalMode: queryForm.retrievalMode,
        queryRewrite: queryForm.queryRewrite,
        topK: queryForm.topK,
        candidateTopK: params.candidateTopK,
        rerank: queryForm.rerank,
        book: queryForm.book,
        resultCount: queryResults.value.length,
        time: new Date().toLocaleString()
      })
      
      // 只保留最近 10 条历史
      if (queryHistory.value.length > 10) {
        queryHistory.value = queryHistory.value.slice(0, 10)
      }
    }
    
    ElMessage.success(`查询完成，找到 ${queryResults.value.length} 条相关内容`)
  } catch (error) {
    console.error('查询失败:', error)
    queryResults.value = []
    searchTrace.value = null
    ElMessage.error(error.response?.data?.message || error.message || '查询失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 重置表单
const handleReset = () => {
  queryForm.query = ''
  queryForm.topK = 5
  queryForm.candidateTopK = 10
  queryForm.retrievalMode = 'dense'
  queryForm.queryRewrite = false
  queryForm.rerank = false
  queryForm.source_type = []
  queryForm.source_name = ''
  queryForm.book = ''
  queryForm.part = ''
  queryForm.chapter = ''
  queryForm.section = ''
  queryForm.article_no = ''
  queryForm.article_no_arabic = ''
  queryForm.business_id = ''
  queryResults.value = []
  searchTrace.value = null
  hasQueried.value = false
}

// 使用历史查询
const useHistoryQuery = (item) => {
  queryForm.query = item.query
  queryForm.topK = item.topK
  queryForm.candidateTopK = item.candidateTopK || Math.max(10, item.topK)
  queryForm.retrievalMode = item.retrievalMode || 'dense'
  queryForm.queryRewrite = Boolean(item.queryRewrite && queryRewriteAvailable.value)
  queryForm.rerank = Boolean(item.rerank && rerankerAvailable.value)
  queryForm.book = item.book || ''
  handleQuery()
}

// 清空历史
const clearHistory = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有查询历史吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    queryHistory.value = []
    ElMessage.success('历史已清空')
  } catch (error) {
    // 取消操作
  }
}

</script>

<style lang="scss" scoped>
.query-page {
  .query-form {
    max-width: 900px;
  }

  .advanced-filters {
    background: #fafafa;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .result-count {
    margin-left: auto;
    font-size: 14px;
    color: #909399;
    font-weight: normal;
  }

  .result-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .result-item {
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    padding: 16px;
    background: #fafafa;
    transition: all 0.3s;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }

  .result-score {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .score-label {
      font-size: 13px;
      color: #606266;
    }
    
    .score-value {
      font-size: 13px;
      font-weight: 600;
      color: #409eff;
    }
  }

  .result-meta {
    margin-bottom: 12px;
  }

  .result-content {
    .content-label {
      font-size: 13px;
      color: #606266;
      margin-bottom: 8px;
      font-weight: 500;
    }
    
    .content-text {
      font-size: 14px;
      line-height: 1.8;
      color: #303133;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 150px;
      overflow: hidden;
      transition: max-height 0.3s;
      background: #fff;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e4e7ed;
      
      &.expanded {
        max-height: none;
      }
    }
  }

  .history-card {
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      border-color: #409eff;
    }
    
    .history-query {
      font-size: 14px;
      color: #303133;
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 600px;
    }
    
    .history-meta {
      font-size: 12px;
      color: #909399;
      display: flex;
      gap: 16px;
    }
  }

  .empty-state {
    text-align: center;
    padding: 40px 0;
  }

  .reranker-alert {
    max-width: 800px;
    margin: 0 0 18px 100px;
  }

  .control-tip {
    margin-left: 12px;
    color: #909399;
    font-size: 13px;
  }

  .mode-tag {
    margin-left: auto;
  }

  .query-snapshot {
    display: flex;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 6px;
    background: #f5f7fa;
    color: #303133;
    line-height: 1.7;
  }

  .rewritten-snapshot {
    margin-top: 10px;
    background: #f0f9eb;
  }

  .rewrite-alert {
    margin-top: 10px;
  }

  .snapshot-label {
    flex: none;
    font-weight: 600;
  }

  .trace-block {
    margin-top: 24px;

    h4 {
      margin: 0 0 12px;
      color: #303133;
    }
  }

  .hint-plan {
    padding: 16px;
    border: 1px solid #d9ecff;
    border-radius: 8px;
    background: #f5faff;
  }

  .hint-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .hint-label {
    width: 72px;
    color: #606266;
    font-weight: 600;
  }

  .enhanced-bm25-snapshot {
    margin-top: 14px;
    background: #fff;
  }

  .hint-description {
    margin: 10px 0 0;
    color: #909399;
    font-size: 13px;
  }

  .full-law-text {
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.65;
  }

  .rank-up {
    color: #67c23a;
    font-weight: 600;
  }

  .rank-down {
    color: #f56c6c;
    font-weight: 600;
  }

  .rank-same {
    color: #909399;
  }
}

@media (max-width: 768px) {
  .query-page {
    .query-form {
      :deep(.el-form-item__label) {
        width: auto !important;
      }
    }

    .advanced-filters {
      padding: 10px;
      margin-bottom: 10px;
    }

    .reranker-alert {
      margin-left: 0;
    }

    .control-tip {
      display: block;
      width: 100%;
      margin: 6px 0 0;
    }

    .query-snapshot {
      flex-direction: column;
      gap: 4px;
    }

    .result-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .result-score {
      width: 100%;
      gap: 6px;

      :deep(.el-progress) {
        width: 100% !important;
      }
    }

    .result-meta {
      :deep(.el-descriptions) {
        display: block;
        overflow-x: auto;
      }
    }

    .history-card {
      .history-query {
        max-width: 100%;
      }

      .history-meta {
        flex-wrap: wrap;
        gap: 8px;
      }
    }
  }
}
</style>
