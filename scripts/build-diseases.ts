import { readFile, writeFile } from 'node:fs/promises'
import {
  DiseaseMentionSchema,
  DiseaseSchema,
  DiseasesPayloadSchema,
} from '../src/domain/disease.ts'
import type { DiseaseMention } from '../src/domain/disease.ts'

/**
 * 病种关联库构建：从 catalog.json 手册条目的「临床意义」字段原文抽取病种提及。
 * 只抽取、不改写：每张病种卡的每条关联都保留原文短引文与手册行号；
 * 病名是索引标签，不构成诊断或选检建议。--check 与已生成文件逐字节对账。
 * 用法：node --experimental-strip-types scripts/build-diseases.ts [--check]
 */

const args = process.argv.slice(2)
const check = args.length === 1 && args[0] === '--check'
if (args.length && !check)
  throw new Error('用法：node --experimental-strip-types scripts/build-diseases.ts [--check]')

const MentionSchema = DiseaseMentionSchema

interface CatalogLike {
  sources: { id: string; manual?: { sha256: string } }[]
  items: {
    id: string
    name: string
    manual?: {
      sourceId: string
      location: { line: number }
      fields: { label: string; value: string; inheritedFrom?: { value: string } }[]
    }
  }[]
}

/* ---------- 抽取规则（保守：宁可漏抽，不造词） ---------- */

/** 病名后缀：片段必须以其中之一结尾才收入索引 */
const DISEASE_SUFFIX = [
  '综合征', '综合症', '心脏病', '血液病', '脑病', '肾病', '肝病', '肺病', '胃病',
  '糖尿病', '高血压', '低血压', '碱中毒', '酸中毒', '中毒', '黄疸', '血症', '贫血',
  '失衡', '失常', '迟缓', '无力', '甲亢', '甲减', '衰竭', '亢进', '减退', '损伤', '损害',
  '障碍', '紊乱', '梗死', '梗塞', '硬化', '结核', '畸形', '子痫', '痛风', '肥胖', '水肿',
  '脱水', '休克', '昏迷', '感染', '发热', '出血', '溶血', '惊厥', '抽搐', '癫痫',
  '肿瘤', '脓肿', '溃疡', '结石', '栓塞', '纤维化', '增生', '肥大', '萎缩', '变性',
  '坏死', '穿孔', '阻塞', '梗阻', '狭窄', '疟疾', '痢疾', '伤寒', '霍乱', '麻疹',
  '风疹', '感冒', '流感', '炎症', '病', '症', '炎', '瘤', '癌', '缺乏', '不足',
]
/** 单词成卡白名单：不以病名后缀结尾、或本身即后缀但可独立成卡的词；含数字的合法病名也在此放行 */
const WHITELIST = new Set([
  '营养不良', '酗酒', '妊娠', '怀孕', '哺乳', '剧烈运动', '应激', '肾衰',
  'IgG4 相关性疾病', 'T3 甲亢',
])
/** 尾词清理：抽出的片段末尾的泛化尾巴 */
const TAIL_TRIM = /(等病|患者|病人|的情况|情况|早期|晚期|急性期|慢性期|愈合期|时|后|期|等)+$/
/** 头词清理：片段开头的泛化修饰 */
const HEAD_TRIM = /^(各类|各种|多种|某些|部分|大部分|常见|严重|其他|其它|有关|相关|各型|如|尤其是|尤其|的)+/
/** 拒收：含这些字样的片段不是病名 */
const REJECT =
  /的|见于|指标|危险|程度|情况|意义|价值|患者|测定|检测|反映|诊断|治疗|预后|监测|判断|因素|标本|结果|参考|敏感|特异|升高|增高|降低|减低|上升|下降|阳性|阴性|正常|异常|明显|主要|一般|临床|应用|评价|评估|方法|检查|检验|各种|使用|患有|近|个月|星期|\s在|\d/
/** 只含这些词时不收（泛化词，不指向具体病种） */
const STOPLIST = new Set([
  '疾病', '病变', '异常', '情况', '重病', '慢病', '大病', '疾病状态', '病态', '急症', '病',
  '亢进', '减退', '缺乏', '不足', '抗癌',
])

function cleanName(fragment: string): string {
  let name = fragment.trim()
  name = name.replace(/^\d+[.、．)]\s*/, '').replace(/^[a-z][）)]/i, '')
  name = name.replace(/^(和|及|以及|或|与|和或)/, '')
  // 判断/存疑类引导语不是病名的一部分
  name = name.replace(/^(对于|对|当怀疑|如怀疑|怀疑|疑为|也可存在于|也可|同时有助于|有助于|存在于|早期发现)+/, '')
  // 触发词跨界：「…导致缺铁性贫血，…，过多易致血色病」中后段的引导词一律剥掉
  name = name.replace(
    /^(过多|过少|缺乏|不足|降低|升高|增高|减低|上升|下降|减少|表现为|提示|反映|反应|会导致|易导致|易引起|会引起|易致|导致|引起|可致|可引|用于|诊断|容易|较易|可|是)+/,
    '',
  )
  name = name.replace(HEAD_TRIM, '')
  name = name.replace(TAIL_TRIM, '')
  return name.trim()
}

function acceptable(name: string): boolean {
  if (name.length < 2 || name.length > 15) return false
  if (STOPLIST.has(name)) return false
  if (REJECT.test(name) && !WHITELIST.has(name)) return false
  if (WHITELIST.has(name)) return true
  return DISEASE_SUFFIX.some((suffix) => name.endsWith(suffix) && name.length >= suffix.length)
}

type Direction = 'increase' | 'decrease' | 'related'
function segmentDirection(segment: string): Direction {
  // 先看减少类：同一小句两种方向并存时（罕见），以先出现者为准
  const decrease = /减低|降低|下降|减少|缺乏|不足|过少|低蛋白|低值/.exec(segment)
  const increase = /增高|升高|上升|过多|过量|高蛋白|高值/.exec(segment)
  if (decrease && (!increase || decrease.index < increase.index)) return 'decrease'
  if (increase) return 'increase'
  return 'related'
}

/** 枚举切分：按 、，, 切，再按 和/及/或 切；括号内「（如风疹、麻疹）」内容同样拆开抽取 */
function* fragments(segment: string): Generator<string> {
  const extras: string[] = []
  const base = segment.replace(/[（(]([^）)]*)[）)]/g, (_, inner: string) => {
    extras.push(inner.replace(/^如/, ''))
    return '、'
  })
  for (const piece of [base, ...extras]) {
    for (const part of piece.split(/[、，,；;]/)) {
      for (const sub of part.split(/和|及|或(?=.{2})|等(?=.)/)) {
        const name = cleanName(sub)
        if (name) yield name
      }
    }
  }
}

interface Harvest {
  name: string
  direction: Direction
}

/** 从一条临床意义原文抽取（病名, 方向）对；逗号分段，方向按各小句自己的触发词定 */
export function harvest(text: string): Harvest[] {
  const flat = text.replace(/<br\s*\/?>/gi, '').trim()
  const found: Harvest[] = []
  let lastDirection: Direction = 'related'
  for (const segment of flat.split(/[，,。；;]/)) {
    if (!segment) continue
    const direction = segmentDirection(segment)
    let matched = false
    const seen = /(?:多)?见于(.+)$/.exec(segment)
    if (seen) {
      for (const name of fragments(seen[1]!))
        if (acceptable(name)) found.push({ name, direction })
      matched = true
    } else {
      /* 无「见于」时的次要模式：抽到的片段同样只收病名 */
      const patterns: RegExp[] = [
        /(?:导致|易致|引起|可致)([^；;。]+)$/,
        /用于(.+?)的?(?:早期筛查和辅助诊断|早期筛查|辅助诊断|筛查|诊断|鉴别诊断)$/,
        /诊断([^，、。；：]{2,15}?)(?=[：的])/,
        /([^，、。；]{2,15}?)诊断$/,
        /(?:主要)?反映([^。；]{2,30})$/,
        /([^，、。；]{2,15}?)的控制程度/,
        /是(.+?)的独立危险因素/,
        /发生([^，、。；]{2,15}?)的危险/,
        /([^，、。；]{2,10}?)风险(?:明显)?(?:升高|增高)?$/,
        /(?:降低|升高|缺乏|过多)表现为([^；;。]+)$/,
        /提示([^，、。；]{2,15})$/,
      ]
      for (const pattern of patterns) {
        const match = pattern.exec(segment)
        if (!match) continue
        for (const name of fragments(match[1]!))
          if (acceptable(name)) found.push({ name, direction })
        matched = true
        break
      }
      // 延续小句：整段就是病名枚举（「以及多发性肌炎、横纹肌溶解症等骨骼肌疾病」「尤其是坏死性肌病」），
      // 方向继承上一命中段
      if (!matched) {
        const inherited = found.length ? lastDirection : direction
        for (const name of fragments(segment))
          if (acceptable(name)) found.push({ name, direction: inherited })
      }
    }
    if (found.length) lastDirection = direction
  }
  return found
}

/* ---------- 构建 ---------- */

async function main(): Promise<void> {
  const catalogText = await readFile(
    new URL('../public/content/catalog.json', import.meta.url),
    'utf8',
  )
  const catalog = JSON.parse(catalogText) as CatalogLike
  const manualSource = catalog.sources.find((source) => source.manual)
  if (!manualSource?.manual) throw new Error('catalog.json 缺少手册来源')

  const byDisease = new Map<string, DiseaseMention[]>()
  let harvestedItems = 0
  let harvestedMentions = 0
  for (const item of catalog.items) {
    if (!item.manual) continue
    const field = item.manual.fields.find((entry) => entry.label === '临床意义')
    if (!field) continue
    const value = field.inheritedFrom?.value ?? field.value
    if (!value.trim()) continue
    const hits = harvest(value)
    if (!hits.length) continue
    harvestedItems += 1
    const quote = value.trim().slice(0, 240)
    const seen = new Set<string>()
    for (const hit of hits) {
      const dedupeKey = `${hit.name}${hit.direction}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const mention = MentionSchema.parse({
        itemId: item.id,
        direction: hit.direction,
        quote,
        line: item.manual.location.line,
      })
      byDisease.set(hit.name, [...(byDisease.get(hit.name) ?? []), mention])
      harvestedMentions += 1
    }
  }

  const names = [...byDisease.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  const diseases = names.map((name, index) =>
    DiseaseSchema.parse({
      id: `d${String(index + 1).padStart(4, '0')}`,
      name,
      mentions: byDisease.get(name)!,
    }),
  )

  const payload = JSON.stringify(
    DiseasesPayloadSchema.parse({
      version: 'diseases-2026-09-19',
      generatedFrom: `catalog.json 手册临床意义字段（手册 sha256 ${manualSource.manual.sha256}）`,
      note: '病种与检验项目的关联全部照录手册「临床意义」原文，未经医学审核；病名是索引标签，不构成诊断或选检建议。',
      diseaseCount: diseases.length,
      diseases,
    }),
  )

  console.log(
    `抽取完成：${harvestedItems} 个项目有临床意义，${diseases.length} 个病种，${harvestedMentions} 条关联`,
  )

  if (check) {
    const actual = await readFile(
      new URL('../public/content/diseases.json', import.meta.url),
      'utf8',
    ).catch(() => null)
    if (actual !== payload)
      throw new Error('diseases.json 与源不一致，请重新运行 build-diseases.ts')
    console.log(`diseases:check 通过，${diseases.length} 个病种与源逐字节一致。`)
  } else {
    await writeFile(new URL('../public/content/diseases.json', import.meta.url), payload)
    console.log(`已生成 public/content/diseases.json（${diseases.length} 个病种，不入 Git）。`)
  }
}

// 仅作为脚本直接运行时执行；被单测 import 时不触发构建
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) await main()
