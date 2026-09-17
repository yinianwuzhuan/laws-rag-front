<template>
  <div class="evaluation-page">
    <div class="page-card hero-card">
      <div class="hero-content">
        <div>
          <div class="page-title hero-title">
            <el-icon><DataAnalysis /></el-icon>
            <span>RAG 检索评测</span>
          </div>
          <p class="hero-description">
            使用黄金问题逐题查询当前 Qdrant，按 business_id 计算召回率、准确率、MRR 与 NDCG。
            本页面只评测检索，不调用大模型生成答案。
          </p>
        </div>
        <el-tag v-if="dataset" size="large" effect="plain">
          {{ dataset.datasetId }} · {{ dataset.totalCount }} 题
        </el-tag>
      </div>

      <el-alert
        title="首次建立基线可以运行当前评测集的全部题目；后续调参只反复运行 Dev，方案冻结后再运行 Test。不可回答题会展示检索结果，但不计入 Recall、MRR 等检索指标。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="!rerankerAvailable"
        class="capability-alert"
        title="当前后端尚未加载本地 Reranker 模型。Dense、BM25 和 Hybrid 仍可评测，但不能进行二阶段重排。"
        type="warning"
        :closable="false"
        show-icon
      />
    </div>

    <div class="page-card control-card">
      <div class="control-grid">
        <div class="control-item">
          <span class="control-label">黄金评测集</span>
          <el-select
            v-model="form.datasetId"
            :disabled="running"
            style="width: 240px"
            placeholder="请选择评测集"
            @change="resetEvaluation"
          >
            <el-option
              v-for="item in datasets"
              :key="item.datasetId"
              :label="`${item.datasetId}（${item.totalCount}题）`"
              :value="item.datasetId"
            />
          </el-select>
        </div>
        <div class="control-item">
          <span class="control-label">评测范围</span>
          <el-select v-model="form.split" :disabled="running" style="width: 210px">
            <el-option :label="`全部（${dataset?.totalCount ?? 60}题）`" value="all" />
            <el-option :label="`Dev 调优集（${dataset?.devCount ?? 40}题）`" value="dev" />
            <el-option :label="`Test 验收集（${dataset?.testCount ?? 20}题）`" value="test" />
          </el-select>
        </div>
        <div class="control-item">
          <span class="control-label">召回方式</span>
          <el-select
            v-model="form.retrievalMode"
            :disabled="running"
            style="width: 190px"
            @change="resetEvaluation"
          >
            <el-option label="Dense 语义向量" value="dense" />
            <el-option label="BM25 关键词" value="bm25" />
            <el-option label="Hybrid（RRF）" value="hybrid" />
          </el-select>
        </div>
        <div class="control-item">
          <span class="control-label">问题重写</span>
          <el-switch
            v-model="form.queryRewrite"
            :disabled="running || !queryRewriteAvailable"
            active-text="原问题 + 通义重写"
            inactive-text="仅原问题"
            @change="resetEvaluation"
          />
        </div>
        <div class="control-item">
          <span class="control-label">重排模式</span>
          <el-switch
            v-model="form.rerank"
            :disabled="running || !rerankerAvailable"
            active-text="开启 Reranker"
            inactive-text="不重排"
            @change="resetEvaluation"
          />
        </div>
        <div v-if="form.rerank" class="control-item">
          <span class="control-label">候选 TopK</span>
          <el-input-number
            v-model="form.candidateTopK"
            :min="form.topK"
            :max="100"
            :disabled="running"
          />
        </div>
        <div class="control-item">
          <span class="control-label">最终 TopK</span>
          <el-input-number v-model="form.topK" :min="1" :max="50" :disabled="running" />
        </div>
        <div class="control-actions">
          <el-button type="primary" size="large" :loading="running" @click="startEvaluation">
            <el-icon><VideoPlay /></el-icon>
            {{ running ? `正在测评 ${completedCount}/${selectedCount}` : '开始测评' }}
          </el-button>
          <el-button v-if="summary" size="large" @click="downloadReport">
            <el-icon><Download /></el-icon>
            下载报告
          </el-button>
        </div>
      </div>

      <div v-if="running || results.length" class="progress-area">
        <div class="progress-meta">
          <span>{{ running ? '逐题检索中' : '本次评测已完成' }}</span>
          <span>{{ completedCount }} / {{ selectedCount }}</span>
        </div>
        <el-progress
          :percentage="progressPercentage"
          :status="summary ? 'success' : undefined"
          :stroke-width="12"
        />
      </div>
    </div>

    <template v-if="summary">
      <div class="summary-grid">
        <div class="metric-card primary">
          <span class="metric-name">Hit@1</span>
          <strong>{{ percent(summaryMetric(1)?.hitRate) }}</strong>
          <small>首条即命中率</small>
        </div>
        <div class="metric-card success">
          <span class="metric-name">Recall@{{ activeTopK }}</span>
          <strong>{{ percent(summaryMetric(activeTopK)?.recall) }}</strong>
          <small>黄金法条召回率</small>
        </div>
        <div class="metric-card warning">
          <span class="metric-name">MRR</span>
          <strong>{{ decimal(summary.mrr) }}</strong>
          <small>首次命中排名质量</small>
        </div>
        <div class="metric-card purple">
          <span class="metric-name">NDCG@{{ activeTopK }}</span>
          <strong>{{ decimal(summaryMetric(activeTopK)?.ndcg) }}</strong>
          <small>考虑核心/辅助依据排序</small>
        </div>
        <div class="metric-card neutral">
          <span class="metric-name">Precision@{{ activeTopK }}</span>
          <strong>{{ percent(summaryMetric(activeTopK)?.precision) }}</strong>
          <small>TopK 中黄金法条占比</small>
        </div>
        <div class="metric-card neutral">
          <span class="metric-name">平均耗时</span>
          <strong>{{ formatDuration(summary.averageLatencyMs) }}</strong>
          <small>P95 {{ formatDuration(summary.p95LatencyMs) }}</small>
        </div>
      </div>

      <div class="page-card aggregate-card">
        <div class="section-heading">
          <div>
            <h3>综合指标</h3>
            <p>{{ summary.scoredCases }} 道可评分题，{{ summary.unanswerableCases }} 道边界题，{{ summary.failedCases }} 道执行失败</p>
          </div>
          <div class="summary-mode">
            <el-tag :type="summary.rerank ? 'success' : 'info'">
              {{ summaryModeText(summary) }}
            </el-tag>
            <span>总耗时 {{ formatDuration(summary.durationMs) }}</span>
          </div>
        </div>
        <el-table :data="summary.cutoffMetrics" border size="small">
          <el-table-column prop="cutoff" label="截断位置" width="110">
            <template #default="scope">@{{ scope.row.cutoff }}</template>
          </el-table-column>
          <el-table-column label="Hit Rate">
            <template #default="scope">{{ percent(scope.row.hitRate) }}</template>
          </el-table-column>
          <el-table-column label="Recall">
            <template #default="scope">{{ percent(scope.row.recall) }}</template>
          </el-table-column>
          <el-table-column label="Precision">
            <template #default="scope">{{ percent(scope.row.precision) }}</template>
          </el-table-column>
          <el-table-column label="NDCG">
            <template #default="scope">{{ decimal(scope.row.ndcg) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <div v-if="results.length" class="page-card detail-card">
      <div class="section-heading">
        <div>
          <h3>逐题结果</h3>
          <p>展开一行可查看黄金法条、重排前后完整顺序及法条全文</p>
        </div>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索题号或问题"
          style="width: 240px"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>

      <el-table
        :data="filteredResults"
        row-key="id"
        border
        stripe
        :default-sort="{ prop: 'sequence', order: 'ascending' }"
      >
        <el-table-column type="expand">
          <template #default="scope">
            <div class="expanded-content">
              <div class="detail-block">
                <h4>黄金法条</h4>
                <template v-if="scope.row.goldDocuments.length">
                  <div v-for="gold in scope.row.goldDocuments" :key="gold.businessId" class="gold-item">
                    <el-tag :type="gold.relevance === 2 ? 'success' : 'info'" size="small">
                      {{ gold.relevance === 2 ? '核心依据' : '辅助依据' }}
                    </el-tag>
                    <strong>《{{ gold.sourceName }}》{{ gold.articleNo }}</strong>
                    <code>{{ gold.businessId }}</code>
                  </div>
                </template>
                <el-alert
                  v-else
                  :title="scope.row.expectedBehavior || '本题不纳入检索指标'"
                  type="warning"
                  :closable="false"
                />
              </div>

              <div v-if="scope.row.cutoffMetrics.length" class="detail-block">
                <h4>本题指标</h4>
                <div class="case-metrics">
                  <div v-for="metric in scope.row.cutoffMetrics" :key="metric.cutoff">
                    <span>@{{ metric.cutoff }}</span>
                    <b>Hit {{ metric.hit ? '是' : '否' }}</b>
                    <b>Recall {{ percent(metric.recall) }}</b>
                    <b>Precision {{ percent(metric.precision) }}</b>
                    <b>NDCG {{ decimal(metric.ndcg) }}</b>
                  </div>
                </div>
              </div>

              <div v-if="scope.row.queryRewrite" class="detail-block">
                <h4>问题重写</h4>
                <el-alert
                  :title="scope.row.rewriteChanged
                    ? scope.row.rewrittenQuery
                    : scope.row.rewriteFallback
                      ? '通义调用失败，已降级为原问题检索'
                      : '模型判断原问题无需改写'"
                  :type="scope.row.rewriteFallback ? 'warning' : 'success'"
                  :closable="false"
                  show-icon
                />
                <p class="rewrite-duration">重写耗时：{{ formatDuration(scope.row.rewriteDurationMs) }}</p>
              </div>

              <div v-if="hasRetrievalHints(scope.row)" class="detail-block hint-plan">
                <h4>规则检索提示（不生成硬过滤）</h4>
                <div class="hint-tags">
                  <el-tag v-for="item in scope.row.retrievalHints.lawNames" :key="`law-${item}`" size="small">
                    {{ item }}
                  </el-tag>
                  <el-tag v-for="item in scope.row.retrievalHints.articleNumbers" :key="`article-${item}`" size="small" type="warning">
                    第{{ item }}条
                  </el-tag>
                  <el-tag v-for="item in scope.row.retrievalHints.concepts" :key="`concept-${item}`" size="small" type="success">
                    {{ item }}
                  </el-tag>
                </div>
                <p><strong>增强BM25：</strong>{{ scope.row.retrievalHints.enhancedBm25Query }}</p>
                <small>原问题召回保持不变；提示只辅助BM25召回和Reranker判断。</small>
              </div>

              <template v-if="scope.row.rewriteChanged">
                <div
                  v-for="channel in rewriteChannels(scope.row)"
                  :key="channel.key"
                  class="detail-block"
                >
                  <h4>{{ channel.title }}原始排名（{{ channel.rows.length }}条）</h4>
                  <el-table :data="channel.rows" size="small" border>
                    <el-table-column prop="vectorRank" label="排名" width="75" />
                    <el-table-column label="命中" width="80">
                      <template #default="candidate">
                        <el-tag :type="candidate.row.matched ? 'success' : 'info'" size="small">
                          {{ candidate.row.matched ? '黄金' : '非黄金' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="法条" min-width="190">
                      <template #default="candidate">
                        {{ candidate.row.sourceName }} {{ candidate.row.articleNo }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="businessId" label="Business ID" min-width="230" />
                    <el-table-column label="检索分数" width="105">
                      <template #default="candidate">{{ score(candidate.row.vectorScore) }}</template>
                    </el-table-column>
                    <el-table-column label="法条完整内容" min-width="420">
                      <template #default="candidate">
                        <div class="full-law-text">{{ candidate.row.text }}</div>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>

                <div class="detail-block stage-divider">
                  <h4>{{ rrfStageTitle(runConfig.retrievalMode) }}</h4>
                  <p>以上原始通道作为同一次 Qdrant Query API 的 Prefetch，由 Qdrant 原生 RRF 直接生成下面的候选排名。</p>
                </div>
              </template>

              <template v-if="runConfig.rerank">
                <div class="detail-block">
                  <h4>重排前：{{ fusionResultTitle(scope.row) }}（{{ scope.row.vectorCandidates.length }}条）</h4>
                  <el-table :data="scope.row.vectorCandidates" size="small" border>
                    <el-table-column prop="vectorRank" label="候选排名" width="90" />
                    <el-table-column label="命中" width="80">
                      <template #default="candidate">
                        <el-tag :type="candidate.row.matched ? 'success' : 'info'" size="small">
                          {{ candidate.row.matched ? '黄金' : '非黄金' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="法条" min-width="180">
                      <template #default="candidate">
                        {{ candidate.row.sourceName }} {{ candidate.row.articleNo }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="businessId" label="Business ID" min-width="220" />
                    <el-table-column label="召回分数" width="105">
                      <template #default="candidate">{{ score(candidate.row.vectorScore) }}</template>
                    </el-table-column>
                    <el-table-column label="法条完整内容" min-width="420">
                      <template #default="candidate">
                        <div class="full-law-text">{{ candidate.row.text }}</div>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>

                <div class="detail-block">
                  <h4>重排后：完整排序（前{{ activeTopK }}条进入最终上下文）</h4>
                  <el-table :data="scope.row.rerankedCandidates" size="small" border>
                    <el-table-column prop="rerankRank" label="重排排名" width="90" />
                    <el-table-column prop="vectorRank" label="原候选排名" width="105" />
                    <el-table-column label="名次变化" width="90">
                      <template #default="candidate">
                        <span :class="rankMovement(candidate.row).className">
                          {{ rankMovement(candidate.row).text }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="结果" width="80">
                      <template #default="candidate">
                        <el-tag :type="candidate.row.rerankRank <= activeTopK ? 'success' : 'info'" size="small">
                          {{ candidate.row.rerankRank <= activeTopK ? '保留' : '淘汰' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="命中" width="80">
                      <template #default="candidate">
                        <el-tag :type="candidate.row.matched ? 'success' : 'info'" size="small">
                          {{ candidate.row.matched ? '黄金' : '非黄金' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="法条" min-width="180">
                      <template #default="candidate">
                        {{ candidate.row.sourceName }} {{ candidate.row.articleNo }}
                      </template>
                    </el-table-column>
                    <el-table-column label="重排分数" width="105">
                      <template #default="candidate">{{ score(candidate.row.rerankScore) }}</template>
                    </el-table-column>
                    <el-table-column label="法条完整内容" min-width="420">
                      <template #default="candidate">
                        <div class="full-law-text">{{ candidate.row.text }}</div>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>

              <div v-else class="detail-block">
                <h4>{{ fusionResultTitle(scope.row) }}</h4>
                <el-table :data="scope.row.retrievedDocuments" size="small" border>
                  <el-table-column prop="vectorRank" label="候选排名" width="90" />
                  <el-table-column label="命中" width="80">
                    <template #default="retrieved">
                      <el-tag :type="retrieved.row.matched ? 'success' : 'info'" size="small">
                        {{ retrieved.row.matched ? '黄金' : '非黄金' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="法条" min-width="170">
                    <template #default="retrieved">
                      {{ retrieved.row.sourceName }} {{ retrieved.row.articleNo }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="businessId" label="Business ID" min-width="220" />
                  <el-table-column label="召回分数" width="100">
                    <template #default="retrieved">{{ score(retrieved.row.vectorScore) }}</template>
                  </el-table-column>
                  <el-table-column label="法条完整内容" min-width="420">
                    <template #default="retrieved">
                      <div class="full-law-text">{{ retrieved.row.text }}</div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sequence" label="#" width="56" sortable />
        <el-table-column label="状态" width="95">
          <template #default="scope">
            <el-tag :type="statusType(scope.row)" size="small">{{ statusText(scope.row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="题号" width="120" />
        <el-table-column prop="question" label="问题" min-width="300" show-overflow-tooltip />
        <el-table-column label="返回" width="70">
          <template #default="scope">{{ scope.row.resultCount }}</template>
        </el-table-column>
        <el-table-column label="首次命中" width="90">
          <template #default="scope">{{ scope.row.firstRelevantRank ? `第${scope.row.firstRelevantRank}名` : '—' }}</template>
        </el-table-column>
        <el-table-column :label="`Recall@${activeTopK}`" width="105">
          <template #default="scope">{{ casePercent(scope.row, 'recall') }}</template>
        </el-table-column>
        <el-table-column label="RR" width="75">
          <template #default="scope">{{ scope.row.reciprocalRank == null ? '—' : decimal(scope.row.reciprocalRank) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="90">
          <template #default="scope">{{ formatDuration(scope.row.durationMs) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="!results.length && !running" class="page-card empty-card">
      <el-empty description="配置本次范围和 TopK，然后开始建立检索基线" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { evaluationApi } from '@/api'

const datasets = ref([])
const rerankerAvailable = ref(false)
const queryRewriteAvailable = ref(false)
const running = ref(false)
const results = ref([])
const summary = ref(null)
const keyword = ref('')
const controller = ref(null)
const runConfig = ref({
  datasetId: '', split: 'all', retrievalMode: 'dense', queryRewrite: false, topK: 5, candidateTopK: 10, rerank: false
})

const form = reactive({
  datasetId: '',
  split: 'all',
  retrievalMode: 'dense',
  queryRewrite: false,
  topK: 5,
  candidateTopK: 10,
  rerank: false
})

const dataset = computed(() =>
  datasets.value.find(item => item.datasetId === form.datasetId) || null
)

onMounted(async () => {
  try {
    const response = await evaluationApi.getDatasets()
    const catalog = response.data || response
    datasets.value = catalog.datasets || []
    rerankerAvailable.value = Boolean(catalog.rerankerAvailable)
    queryRewriteAvailable.value = Boolean(catalog.queryRewriteAvailable)
    form.datasetId = catalog.defaultDatasetId || datasets.value[0]?.datasetId || ''
  } catch (error) {
    console.error('加载评测集列表失败:', error)
    ElMessage.error('加载黄金评测集列表失败')
  }
})

onBeforeUnmount(() => controller.value?.abort())

const selectedCount = computed(() => {
  const split = running.value || results.value.length ? runConfig.value.split : form.split
  if (!dataset.value) return 0
  if (split === 'dev') return dataset.value.devCount
  if (split === 'test') return dataset.value.testCount
  return dataset.value.totalCount
})

const activeTopK = computed(() =>
  running.value || results.value.length ? runConfig.value.topK : form.topK
)

const completedCount = computed(() => results.value.length)
const progressPercentage = computed(() => {
  if (!selectedCount.value) return 0
  return Math.min(100, Math.round(completedCount.value * 100 / selectedCount.value))
})

const filteredResults = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  if (!text) return results.value
  return results.value.filter(item =>
    item.id.toLowerCase().includes(text) || item.question.toLowerCase().includes(text)
  )
})

const startEvaluation = async () => {
  if (!form.datasetId) {
    ElMessage.warning('请先选择黄金评测集')
    return
  }
  results.value = []
  summary.value = null
  keyword.value = ''
  running.value = true
  runConfig.value = {
    datasetId: form.datasetId,
    split: form.split,
    retrievalMode: form.retrievalMode,
    queryRewrite: form.queryRewrite,
    topK: form.topK,
    candidateTopK: form.rerank ? Math.max(form.candidateTopK, form.topK) : form.topK,
    rerank: form.rerank
  }
  controller.value = new AbortController()

  try {
    await evaluationApi.runRetrieval(runConfig.value, (eventName, data) => {
      if (eventName === 'case_result') {
        results.value.push(data)
      } else if (eventName === 'summary') {
        summary.value = data
      } else if (eventName === 'evaluation_error') {
        throw new Error(data?.message || '评测执行失败')
      }
    }, controller.value.signal)

    if (summary.value) {
      ElMessage.success(`评测完成，共执行 ${summary.value.totalCases} 题`)
    } else {
      throw new Error('评测流已结束，但未收到综合结果')
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('评测失败:', error)
      ElMessage.error(error.message || '评测执行失败')
    }
  } finally {
    running.value = false
    controller.value = null
  }
}

const summaryMetric = (cutoff) => summary.value?.cutoffMetrics?.find(item => item.cutoff === cutoff)

const resetEvaluation = () => {
  results.value = []
  summary.value = null
  keyword.value = ''
}
const caseMetric = (row) => row.cutoffMetrics?.find(item => item.cutoff === activeTopK.value)
const casePercent = (row, field) => {
  const metric = caseMetric(row)
  return metric ? percent(metric[field]) : '—'
}

const percent = (value) => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const decimal = (value) => value == null ? '—' : Number(value).toFixed(3)
const score = (value) => value == null ? '—' : Number(value).toFixed(4)
const retrievalModeLabel = (mode) => ({
  dense: 'Dense 向量',
  bm25: 'BM25 关键词',
  hybrid: 'Hybrid RRF'
}[mode] || mode || 'Dense 向量')
const rrfStageTitle = (mode) => mode === 'hybrid'
  ? '四路 Qdrant RRF 融合'
  : '双路 Qdrant RRF 融合'
const fusionResultTitle = (row) => row.rewriteChanged
  ? `${rrfStageTitle(row.retrievalMode || runConfig.value.retrievalMode)}候选`
  : `${retrievalModeLabel(row.retrievalMode || runConfig.value.retrievalMode)}检索结果`
const rewriteChannels = (row) => {
  const mode = row.retrievalMode || runConfig.value.retrievalMode
  const channels = []
  if (mode !== 'bm25') {
    channels.push({ key: 'original-dense', title: '原问题 Dense', rows: row.originalDenseCandidates || [] })
  }
  if (mode !== 'dense') {
    channels.push({ key: 'original-bm25', title: '原问题 BM25', rows: row.originalBm25Candidates || [] })
  }
  if (mode !== 'bm25') {
    channels.push({ key: 'rewritten-dense', title: '重写问题 Dense', rows: row.rewrittenDenseCandidates || [] })
  }
  if (mode !== 'dense') {
    channels.push({ key: 'rewritten-bm25', title: '增强 BM25（基于重写问题）', rows: row.rewrittenBm25Candidates || [] })
  }
  return channels
}
const hasRetrievalHints = (row) => Boolean(row.retrievalHints && (
  row.retrievalHints.lawNames?.length
  || row.retrievalHints.articleNumbers?.length
  || row.retrievalHints.concepts?.length
))
const summaryModeText = (value) => {
  const base = retrievalModeLabel(value.retrievalMode || runConfig.value.retrievalMode)
  const rewrite = value.queryRewrite || runConfig.value.queryRewrite ? ' + 问题重写' : ''
  return value.rerank
    ? `${base}${rewrite} Top${value.candidateTopK} → 重排 Top${value.topK}`
    : `${base}${rewrite} Top${value.topK}`
}
const rankMovement = (row) => {
  const movement = row.vectorRank - row.rerankRank
  if (movement > 0) return { text: `↑ ${movement}`, className: 'rank-up' }
  if (movement < 0) return { text: `↓ ${Math.abs(movement)}`, className: 'rank-down' }
  return { text: '—', className: 'rank-same' }
}
const formatDuration = (value) => {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(2)}s`
}

const statusType = (row) => {
  if (row.status === 'ERROR') return 'danger'
  if (row.status === 'NOT_SCORED') return 'info'
  const recall = caseMetric(row)?.recall ?? 0
  if (recall === 1) return 'success'
  if (recall > 0) return 'warning'
  return 'danger'
}

const statusText = (row) => {
  if (row.status === 'ERROR') return '失败'
  if (row.status === 'NOT_SCORED') return '边界题'
  const recall = caseMetric(row)?.recall ?? 0
  if (recall === 1) return '全命中'
  if (recall > 0) return '部分命中'
  return '未命中'
}

const downloadReport = () => {
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: dataset.value,
    configuration: { ...runConfig.value },
    summary: summary.value,
    cases: results.value
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const retrieval = runConfig.value.retrievalMode || 'dense'
  const rewrite = runConfig.value.queryRewrite ? '-rewrite' : ''
  const mode = runConfig.value.rerank ? `${retrieval}${rewrite}-rerank-${runConfig.value.candidateTopK}-to-${runConfig.value.topK}` : `${retrieval}${rewrite}-top${runConfig.value.topK}`
  link.download = `${dataset.value?.datasetId || 'rag-evaluation'}-${runConfig.value.split}-${mode}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss" scoped>
.evaluation-page {
  max-width: 1500px;
  margin: 0 auto;
}

.hero-card {
  border-top: 4px solid #409eff;
}

.hero-content,
.section-heading,
.control-grid,
.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.hero-title {
  margin-bottom: 8px;
}

.hero-description,
.section-heading p {
  color: #606266;
  line-height: 1.7;
}

.hero-card :deep(.el-alert) {
  margin-top: 20px;
}

.control-grid {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-label {
  color: #606266;
  font-size: 14px;
  font-weight: 600;
}

.control-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.progress-area {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #ebeef5;
}

.progress-meta {
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.metric-card {
  position: relative;
  overflow: hidden;
  background: #fff;
  border-radius: 10px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
  border-left: 4px solid #909399;

  &.primary { border-left-color: #409eff; }
  &.success { border-left-color: #67c23a; }
  &.warning { border-left-color: #e6a23c; }
  &.purple { border-left-color: #9b59b6; }

  .metric-name,
  small {
    display: block;
    color: #909399;
  }

  strong {
    display: block;
    margin: 8px 0 5px;
    color: #303133;
    font-size: 27px;
  }

  small { font-size: 12px; }
}

.section-heading {
  margin-bottom: 16px;

  h3 {
    color: #303133;
    margin-bottom: 5px;
  }

  > span {
    color: #909399;
    font-size: 13px;
  }
}

.summary-mode {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #909399;
  font-size: 13px;
}

.expanded-content {
  padding: 6px 22px 20px 54px;
  background: #fafcff;
}

.detail-block {
  margin-top: 18px;

  h4 {
    color: #303133;
    margin-bottom: 10px;
  }
}

.hint-plan {
  padding: 14px 16px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: #f5faff;

  p {
    margin: 12px 0 6px;
    line-height: 1.65;
  }

  small { color: #909399; }
}

.hint-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.full-law-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
  color: #303133;
}

.rank-up {
  color: #67c23a;
  font-weight: 700;
}

.rank-down {
  color: #f56c6c;
  font-weight: 700;
}

.rank-same {
  color: #909399;
}

.gold-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 0;

  code {
    padding: 3px 7px;
    border-radius: 4px;
    background: #eef2f7;
    color: #606266;
  }
}

.case-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  > div {
    display: flex;
    gap: 13px;
    padding: 9px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #fff;
    font-size: 13px;
  }

  span { color: #409eff; font-weight: 700; }
  b { font-weight: 500; color: #606266; }
}

.empty-card {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1200px) {
  .summary-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 768px) {
  .hero-content,
  .section-heading,
  .control-grid {
    align-items: stretch;
    flex-direction: column;
  }

  .control-item {
    justify-content: space-between;
  }

  .control-item :deep(.el-select),
  .control-item :deep(.el-input-number) {
    width: 65% !important;
  }

  .control-actions {
    margin-left: 0;
  }

  .control-actions .el-button {
    flex: 1;
  }

  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .metric-card strong { font-size: 23px; }
  .expanded-content { padding: 4px 8px 16px; }
  .section-heading :deep(.el-input) { width: 100% !important; }
}
</style>
