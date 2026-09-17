<template>
  <div class="generation-page">
    <section class="page-card intro-card">
      <div>
        <h2>RAG 生成评测</h2>
        <p>同一道题分别使用黄金法条和系统检索结果生成答案，再由独立的强模型评价答案质量。</p>
      </div>
      <el-tag size="large" type="warning">Judge：{{ judgeModel || '未配置' }}</el-tag>
    </section>

    <el-alert
      v-if="!judgeAvailable"
      class="availability-alert"
      type="error"
      :closable="false"
      title="CF_API_FAN_API_KEY 未配置，当前不能运行生成评测。"
    />

    <section class="page-card controls">
      <div class="control-row">
        <label>黄金评测集</label>
        <el-select v-model="form.datasetId" class="dataset-select" @change="reset">
          <el-option v-for="item in datasets" :key="item.datasetId"
                     :label="`${item.datasetId}（${item.totalCount}题）`" :value="item.datasetId" />
        </el-select>
        <label>范围</label>
        <el-select v-model="form.split" class="short-select" @change="reset">
          <el-option label="Dev 调优集" value="dev" />
          <el-option label="Test 验收集" value="test" />
          <el-option label="全部" value="all" />
        </el-select>
        <label>本次题数</label>
        <el-input-number v-model="form.limit" :min="1" :max="100" />
        <el-tooltip content="少于当前分组总题数时，每次按新随机种子抽取；随机种子会写入报告">
          <el-tag type="success" effect="plain">随机抽题</el-tag>
        </el-tooltip>
        <label>真实召回</label>
        <el-select v-model="form.retrievalMode" class="short-select">
          <el-option label="Hybrid (RRF)" value="hybrid" />
          <el-option label="Dense 向量" value="dense" />
          <el-option label="BM25 关键词" value="bm25" />
        </el-select>
      </div>
      <div class="control-row second-row">
        <el-checkbox v-model="form.queryRewrite" :disabled="!queryRewriteAvailable">问题重写</el-checkbox>
        <el-checkbox v-model="form.rerank" :disabled="!rerankerAvailable">Reranker</el-checkbox>
        <label>候选 TopK</label>
        <el-input-number v-model="form.candidateTopK" :min="form.topK" :max="50" />
        <label>最终 TopK</label>
        <el-input-number v-model="form.topK" :min="1" :max="20" />
        <el-button type="primary" size="large" :loading="running"
                   :disabled="!judgeAvailable" @click="start">
          {{ running ? '评测进行中' : '开始双路评测' }}
        </el-button>
        <el-button size="large" :disabled="!results.length" @click="downloadReport">
          下载报告
        </el-button>
        <el-button v-if="running" size="large" @click="stop">停止</el-button>
      </div>
      <div v-if="running || results.length" class="progress-row">
        <span>{{ progressLabel }}：{{ results.length }} / {{ targetCount }}</span>
        <el-tag v-if="activeRun?.sampleSeed" class="seed-tag" type="info" effect="plain">
          随机种子 {{ activeRun.sampleSeed }}
        </el-tag>
        <el-progress :percentage="progress" :status="summary ? 'success' : undefined" />
      </div>
    </section>

    <section v-if="summary" class="summary-grid">
      <div class="score-card gold">
        <span>黄金上下文总分</span><strong>{{ summary.scoredCases ? fixed(summary.goldContextScore.overall) : '—' }}</strong>
        <small>生成能力上限</small>
      </div>
      <div class="score-card rag">
        <span>实际 RAG 总分</span><strong>{{ summary.scoredCases ? fixed(summary.ragScore.overall) : '—' }}</strong>
        <small>实际检索上下文的生成质量</small>
      </div>
      <div class="score-card gap">
        <span>Oracle Gap</span><strong>{{ summary.scoredCases ? signed(summary.oracleGap) : '—' }}</strong>
        <small>黄金上下文分 − 实际 RAG 分</small>
      </div>
      <div class="score-card">
        <span>实际 RAG 达标</span><strong>{{ summary.ragSuccessCases }} / {{ summary.scoredCases }}</strong>
        <small>总分 ≥ {{ summary.successThreshold }}</small>
      </div>
      <div class="score-card">
        <span>平均单题耗时</span><strong>{{ duration(summary.averageLatencyMs) }}</strong>
        <small>两次生成 + 检索 + Judge</small>
      </div>
      <div class="score-card token-card">
        <span>本次 Token 消耗</span><strong>{{ tokens(summary.overallTokens) }}</strong>
        <small>输入 {{ tokenNumber(summary.overallTokens?.inputTokens) }} · 输出 {{ tokenNumber(summary.overallTokens?.outputTokens) }} · 平均每题 {{ tokenNumber(summary.averageTokensPerCase) }}</small>
        <small>黄金 {{ tokens(summary.goldGenerationTokens) }} · RAG {{ tokens(summary.ragGenerationTokens) }} · Judge {{ tokens(summary.judgeTokens) }}</small>
        <small v-if="summary.overallTokens?.unavailableCalls" class="usage-warning">
          {{ summary.overallTokens.unavailableCalls }} 次调用未返回 Usage
        </small>
      </div>
      <div class="score-card cause-card">
        <span>主要问题归因</span>
        <strong>检索 {{ summary.rootCauseCounts?.RETRIEVAL || 0 }} · 生成 {{ summary.rootCauseCounts?.GENERATION || 0 }}</strong>
        <small>共同问题 {{ summary.rootCauseCounts?.BOTH || 0 }} · 无明显问题 {{ summary.rootCauseCounts?.NONE || 0 }}</small>
      </div>
    </section>

    <section v-if="summary" class="page-card metric-comparison">
      <h3>指标对比</h3>
      <el-table :data="metricRows" border>
        <el-table-column prop="label" label="指标" />
        <el-table-column prop="gold" label="黄金上下文" />
        <el-table-column prop="rag" label="实际 RAG" />
        <el-table-column prop="gap" label="差值（黄金 - RAG）" />
      </el-table>
    </section>

    <section v-if="results.length" class="page-card result-card">
      <h3>逐题结果</h3>
      <el-table :data="results" row-key="id" border>
        <el-table-column type="expand">
              <template #default="{ row }">
            <div class="case-detail">
              <el-alert v-if="row.status !== 'SCORED'" type="error" :closable="false"
                        :title="row.status === 'JUDGE_ERROR' ? `Judge评分失败：${row.error}` : row.error" />
              <template v-else>
                <div class="comparison-note">
                  <el-tag :type="causeType(row.rootCause)">{{ causeLabel(row.rootCause) }}</el-tag>
                  <span>{{ row.comparisonReason }}</span>
                </div>
                <div class="answer-grid">
                  <article>
                    <h4>黄金上下文生成答案 · {{ fixed(row.goldEvaluation?.overall) }} 分</h4>
                    <div class="stage-stats">
                      {{ tokens(row.goldTokenUsage) }} Token · {{ duration(row.goldGenerationMs) }}
                      <span v-if="row.goldTokenUsage?.available">（输入 {{ tokenNumber(row.goldTokenUsage.inputTokens) }} / 输出 {{ tokenNumber(row.goldTokenUsage.outputTokens) }}）</span>
                    </div>
                    <div class="metric-tags">
                      <el-tag size="small">正确 {{ fixed(row.goldEvaluation?.correctness) }}</el-tag>
                      <el-tag size="small">完整 {{ fixed(row.goldEvaluation?.completeness) }}</el-tag>
                      <el-tag size="small">忠实 {{ fixed(row.goldEvaluation?.faithfulness) }}</el-tag>
                      <el-tag size="small">引用 {{ fixed(row.goldEvaluation?.citationQuality) }}</el-tag>
                      <el-tag size="small" type="success">相关 {{ fixed(row.goldEvaluation?.answerRelevancy) }}</el-tag>
                    </div>
                    <pre>{{ row.goldAnswer }}</pre>
                  </article>
                  <article>
                    <h4>实际 RAG 生成答案 · {{ fixed(row.ragEvaluation?.overall) }} 分</h4>
                    <div class="stage-stats">
                      {{ tokens(row.ragTokenUsage) }} Token · {{ duration(row.ragGenerationMs) }}
                      <span v-if="row.ragTokenUsage?.available">（输入 {{ tokenNumber(row.ragTokenUsage.inputTokens) }} / 输出 {{ tokenNumber(row.ragTokenUsage.outputTokens) }}）</span>
                    </div>
                    <div class="metric-tags">
                      <el-tag size="small">正确 {{ fixed(row.ragEvaluation?.correctness) }}</el-tag>
                      <el-tag size="small">完整 {{ fixed(row.ragEvaluation?.completeness) }}</el-tag>
                      <el-tag size="small">忠实 {{ fixed(row.ragEvaluation?.faithfulness) }}</el-tag>
                      <el-tag size="small">引用 {{ fixed(row.ragEvaluation?.citationQuality) }}</el-tag>
                      <el-tag size="small" type="success">相关 {{ fixed(row.ragEvaluation?.answerRelevancy) }}</el-tag>
                    </div>
                    <pre>{{ row.ragAnswer }}</pre>
                  </article>
                </div>
                <div class="answer-grid">
                  <article>
                    <h4>黄金上下文（{{ row.goldContext.length }} 条）</h4>
                    <div v-for="doc in row.goldContext" :key="`g-${doc.rank}`" class="context-doc">
                      <b>{{ doc.rank }}. 《{{ doc.sourceName }}》{{ doc.articleNo }}</b>
                      <p>{{ doc.text }}</p>
                    </div>
                  </article>
                  <article>
                    <h4>真实检索上下文（{{ row.ragContext.length }} 条）</h4>
                    <div v-for="doc in row.ragContext" :key="`r-${doc.rank}`" class="context-doc">
                      <b>{{ doc.rank }}. 《{{ doc.sourceName }}》{{ doc.articleNo }}</b>
                      <p>{{ doc.text }}</p>
                    </div>
                  </article>
                </div>
                <div class="judge-details">
                  <div><b>本题 Token：</b>总计 {{ tokens(row.totalTokenUsage) }}；Judge {{ tokens(row.judgeTokenUsage) }}（{{ duration(row.judgeMs) }}）</div>
                  <div><b>黄金侧 Judge：</b>{{ row.goldEvaluation?.reason }}</div>
                  <div><b>RAG 侧 Judge：</b>{{ row.ragEvaluation?.reason }}</div>
                  <div v-if="judgeProblems(row.ragEvaluation).length">
                    <b>RAG 主要问题：</b>{{ judgeProblems(row.ragEvaluation).join('；') }}
                  </div>
                </div>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sequence" label="#" width="55" />
        <el-table-column prop="id" label="题目 ID" width="150" />
        <el-table-column prop="question" label="问题" min-width="360" />
        <el-table-column label="黄金分" width="95">
          <template #default="{ row }">{{ fixed(row.goldEvaluation?.overall) }}</template>
        </el-table-column>
        <el-table-column label="RAG 分" width="95">
          <template #default="{ row }">{{ fixed(row.ragEvaluation?.overall) }}</template>
        </el-table-column>
        <el-table-column label="差值" width="90">
          <template #default="{ row }">{{ caseGap(row) }}</template>
        </el-table-column>
        <el-table-column label="归因" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'SCORED'" :type="causeType(row.rootCause)">{{ causeLabel(row.rootCause) }}</el-tag>
            <el-tag v-else type="danger">{{ row.status === 'JUDGE_ERROR' ? '裁判失败' : '执行失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Token" width="105">
          <template #default="{ row }">{{ tokens(row.totalTokenUsage) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100">
          <template #default="{ row }">{{ duration(row.durationMs) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <section v-if="!results.length && !running" class="page-card empty-card">
      <el-empty description="建议先运行 3～5 题检查提示词和费用，再扩大到 Dev 或 Test" />
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { evaluationApi } from '@/api'

const datasets = ref([])
const judgeAvailable = ref(false)
const judgeModel = ref('')
const rerankerAvailable = ref(false)
const queryRewriteAvailable = ref(false)
const running = ref(false)
const results = ref([])
const summary = ref(null)
const controller = ref(null)
const activeRun = ref(null)
const announcedTarget = ref(0)
const form = reactive({ datasetId: '', split: 'dev', limit: 5, retrievalMode: 'hybrid',
  queryRewrite: true, rerank: true, candidateTopK: 10, topK: 5 })

onMounted(async () => {
  try {
    const response = await evaluationApi.getDatasets()
    const catalog = response.data || response
    datasets.value = catalog.datasets || []
    judgeAvailable.value = Boolean(catalog.judgeAvailable)
    judgeModel.value = catalog.judgeModel || ''
    rerankerAvailable.value = Boolean(catalog.rerankerAvailable)
    queryRewriteAvailable.value = Boolean(catalog.queryRewriteAvailable)
    form.datasetId = catalog.defaultDatasetId || datasets.value[0]?.datasetId || ''
    form.rerank = rerankerAvailable.value
    form.queryRewrite = queryRewriteAvailable.value
  } catch (error) {
    ElMessage.error('加载评测能力失败')
  }
})

onBeforeUnmount(() => controller.value?.abort())

const targetCount = computed(() => announcedTarget.value || activeRun.value?.limit || form.limit)
const progress = computed(() => targetCount.value ? Math.min(100, Math.round(results.value.length * 100 / targetCount.value)) : 0)
const progressLabel = computed(() => {
  if (running.value) return '生成并裁判中'
  if (summary.value) return '本次评测已完成'
  return '本次评测已中断'
})
const metricRows = computed(() => {
  if (!summary.value) return []
  const labels = { correctness: '正确性（30%）', completeness: '完整性（20%）', faithfulness: '上下文忠实性（25%）', citationQuality: '引用质量（15%）', answerRelevancy: '回答相关性（10%）', overall: '加权总分' }
  return Object.entries(labels).map(([key, label]) => ({ label,
    gold: summary.value.scoredCases ? fixed(summary.value.goldContextScore[key]) : '—',
    rag: summary.value.scoredCases ? fixed(summary.value.ragScore[key]) : '—',
    gap: summary.value.scoredCases
      ? signed(summary.value.goldContextScore[key] - summary.value.ragScore[key]) : '—' }))
})

const start = async () => {
  if (!form.datasetId) return ElMessage.warning('请先选择黄金评测集')
  reset()
  running.value = true
  activeRun.value = { ...form, candidateTopK: form.rerank ? Math.max(form.candidateTopK, form.topK) : form.topK }
  controller.value = new AbortController()
  try {
    await evaluationApi.runGeneration(activeRun.value, (event, data) => {
      if (event === 'started') {
        const splitCount = data.split === 'dev' ? data.dataset?.devCount
          : data.split === 'test' ? data.dataset?.testCount : data.dataset?.totalCount
        announcedTarget.value = Math.min(data.limit || activeRun.value.limit, splitCount || data.limit || activeRun.value.limit)
        activeRun.value.sampleSeed = data.sampleSeed
      } else if (event === 'case_result') results.value.push(data)
      else if (event === 'summary') summary.value = data
      else if (event === 'evaluation_error') throw new Error(data?.message || '生成评测失败')
    }, controller.value.signal)
    if (!summary.value) throw new Error('评测结束但未收到汇总结果')
    ElMessage.success(`双路生成评测完成，共 ${summary.value.scoredCases} 题成功评分`)
  } catch (error) {
    if (error.name !== 'AbortError') ElMessage.error(error.message || '生成评测失败')
  } finally {
    running.value = false
    controller.value = null
  }
}

const stop = () => controller.value?.abort()
const reset = () => { if (!running.value) { results.value = []; summary.value = null; activeRun.value = null; announcedTarget.value = 0 } }
const downloadReport = () => {
  if (!results.value.length) return
  const report = {
    reportType: 'rag-generation-evaluation',
    exportedAt: new Date().toISOString(),
    complete: Boolean(summary.value),
    config: activeRun.value || { ...form },
    summary: summary.value,
    completedCases: results.value.length,
    expectedCases: targetCount.value,
    results: results.value
  }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const datasetId = activeRun.value?.datasetId || form.datasetId || 'generation-evaluation'
  const split = activeRun.value?.split || form.split
  link.href = url
  link.download = `${datasetId}-${split}-generation-evaluation.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
const fixed = value => value == null ? '—' : Number(value).toFixed(1)
const signed = value => value == null ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}`
const duration = ms => ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
const tokenNumber = value => value == null ? '—' : Math.round(Number(value)).toLocaleString('zh-CN')
const tokens = usage => usage == null || usage.available === false
  || (usage.measuredCalls === 0 && usage.unavailableCalls > 0)
  ? '未返回' : tokenNumber(usage.totalTokens)
const caseGap = row => row.goldEvaluation && row.ragEvaluation ? signed(row.goldEvaluation.overall - row.ragEvaluation.overall) : '—'
const causeLabel = cause => ({ RETRIEVAL: '检索问题', GENERATION: '生成问题', BOTH: '共同问题', NONE: '无明显问题' }[cause] || cause)
const causeType = cause => ({ RETRIEVAL: 'warning', GENERATION: 'danger', BOTH: 'danger', NONE: 'success' }[cause] || 'info')
const judgeProblems = score => [...(score?.unsupportedClaims || []), ...(score?.missingPoints || []), ...(score?.citationIssues || [])]
</script>

<style lang="scss" scoped>
.generation-page { display: flex; flex-direction: column; gap: 18px; }
.page-card { background: #fff; border-radius: 12px; padding: 22px; box-shadow: 0 4px 18px rgba(31,45,61,.07); }
.intro-card { display: flex; align-items: center; justify-content: space-between; border-top: 4px solid #409eff;
  h2 { margin: 0 0 8px; } p { margin: 0; color: #606266; } }
.availability-alert { margin: 0; }
.control-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; label { font-weight: 600; color: #606266; } }
.second-row { margin-top: 18px; }
.dataset-select { width: 240px; } .short-select { width: 150px; }
.progress-row { margin-top: 20px; color: #606266; .el-progress { margin-top: 8px; } }
.seed-tag { margin-left: 10px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: 14px; }
.score-card { background: #fff; border-radius: 12px; padding: 18px; border-left: 4px solid #909399; box-shadow: 0 4px 18px rgba(31,45,61,.07);
  display: flex; flex-direction: column; gap: 7px; span, small { color: #909399; } strong { font-size: 30px; color: #303133; }
  &.gold { border-color: #e6a23c; } &.rag { border-color: #409eff; } &.gap { border-color: #9b59b6; } }
.token-card { border-color: #67c23a; }
.usage-warning { color: #e6a23c !important; }
.cause-card strong { font-size: 20px; }
.metric-comparison h3, .result-card h3 { margin-top: 0; }
.case-detail { padding: 14px 28px 24px; }
.comparison-note { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.answer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
  article { min-width: 0; border: 1px solid #e4e7ed; border-radius: 8px; padding: 14px; }
  h4 { margin: 0 0 12px; } pre { white-space: pre-wrap; font: inherit; line-height: 1.7; margin: 0; } }
.metric-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.stage-stats { margin: -4px 0 12px; color: #909399; font-size: 13px; }
.context-doc { border-top: 1px dashed #dcdfe6; padding: 10px 0; p { white-space: pre-wrap; line-height: 1.6; margin: 6px 0 0; } }
.judge-details { line-height: 1.8; background: #f5f7fa; padding: 14px; border-radius: 8px; }
.empty-card { min-height: 180px; }
@media (max-width: 1100px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } .answer-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) { .page-card { padding: 14px; } .intro-card { align-items: flex-start; gap: 12px; } .summary-grid { grid-template-columns: 1fr; } .dataset-select, .short-select { width: 100%; } }
</style>
