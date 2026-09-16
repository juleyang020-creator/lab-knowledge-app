#!/usr/bin/env python3
"""给 public/content/professional.json 的 9 个教学项目增加
「检验原理」「影响因素」两个 section（document 溯源，biochem-2025）。

引文均为《临床生物化学检验技术》第2版原文片段（≤240 字符），页码为 PDF 物理页，
已逐条回源 PDF 文本层核验（2026-09-16）。quote 字段取同页可检索的原文短句。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROF = ROOT / "public" / "content" / "professional.json"

# (itemId, 原理claim, 影响因素claim)
# 每条 claim: (text, quote, pdfPage)
DATA = {
    "glucose": {
        "principle": (
            "葡萄糖检测常用己糖激酶法（己糖激酶与葡萄糖-6-磷酸脱氢酶偶联）或葡萄糖氧化酶法（葡萄糖氧化酶偶联过氧化物酶）。",
            "己糖激酶法: 利用己糖激酶和葡萄糖 -6- 磷酸脱氢酶偶联测定",
            162,
        ),
        "factors": (
            "室温下糖酵解会使未分离血清的葡萄糖浓度以每小时5%～7%（0.28～0.56mmol/L）下降，加入氟化钠或碘乙酸钠抑制糖酵解后可在室温下稳定3天。",
            "室温下糖酵解会使未分离血清的血液标本中的葡萄糖浓度以每小时",
            163,
        ),
    },
    "hba1c": {
        "principle": (
            "HbA1c检测方法按电荷、结构差异区分：离子交换高效液相色谱法是检测的“金标准”；另有亲和层析法、免疫化学法和酶法。",
            "离子交换高效液相色谱法是 HbA1c 检测的“金标准”",
            168,
        ),
        "factors": (
            "HbA1c浓度与红细胞寿命（平均120天）及该时期内血糖平均浓度有关，不受每天葡萄糖波动、运动或食物的影响，反映过去2～3个月的平均血糖浓度。",
            "HbA1c 的形成是不可逆的",
            168,
        ),
    },
    "alt": {
        "principle": (
            "目前国内外实验室多采用IFCC推荐的连续监测法测定ALT：ALT催化氨基从L-丙氨酸转移到α-酮戊二酸，偶联LDH指示反应，在340nm处连续测定NADH消耗量计算酶活性。",
            "目前国内外实验室多采用 IFCC 推荐的连续监测方法对 ALT 进行测定",
            153,
        ),
        "factors": (
            "连续监测ALT反应中存在副反应：血清中α-酮酸（如丙酮酸）消耗NADH；血清谷氨酸脱氢酶增高时在有氨存在条件下亦消耗NADH，可使测定结果偏高。",
            "连续监测ALT反应中存在两个副反应",
            153,
        ),
    },
    "ast": {
        "principle": (
            "AST催化L-天冬氨酸和α-酮戊二酸生成草酰乙酸和L-谷氨酸，草酰乙酸在苹果酸脱氢酶作用下与NADH反应，连续测定340nm处NADH吸光度下降速率计算酶活性，属酶偶联法。",
            "AST 可催化 L- 天冬氨酸和 $\\alpha$ - 酮戊二酸生成草酰乙酸和 L- 谷氨酸",
            154,
        ),
        "factors": (
            "影响血清酶的生理因素包括性别、年龄、饮食、运动、妊娠等；AST不只分布于肝脏，也分布于心肌、骨骼肌和肾脏，相应组织损伤也可使AST升高。",
            "影响血清酶的生理因素包括性别、年龄、饮食、运动、妊娠等",
            144,
        ),
    },
    "creatinine": {
        "principle": (
            "肌酐检测方法包括苦味酸速率法（基于Jaffe提出的碱性苦味酸反应）和酶法（肌酐氨基水解酶法、肌氨酸氧化酶法、肌酐亚氨基水解酶法等）。",
            "肌酐检测方法包括苦味酸速率法和酶法",
            133,
        ),
        "factors": (
            "Jaffe反应并非仅对肌酐特异，也可与蛋白质、高浓度葡萄糖、抗坏血酸等物质生成类似色原；肌氨酸氧化酶法的Trinder反应易受胆红素和维生素C干扰。",
            "Jaffe 反应并非仅对肌酐特异",
            134,
        ),
    },
    "urea": {
        "principle": (
            "尿素检测方法为酶法：脲酶将尿素分解成铵离子和碳酸根，再利用谷氨酸脱氢酶（GLDH）或Berthelot反应测定铵离子生成量，属间接测定。",
            "尿素检测方法为酶法",
            132,
        ),
        "factors": (
            "血尿素浓度受蛋白质分解或摄入的影响：高热、上消化道大出血、大面积烧伤、大手术后、高蛋白饮食、甲状腺功能亢进等可使血尿素增高；低蛋白饮食、多饮水、慢性肝脏疾病等可使其下降。",
            "血尿素浓度还受到蛋白质分解或摄入的影响",
            291,
        ),
    },
    "crp": {
        "principle": (
            "CRP检测采用免疫散射比浊法等；超敏CRP（hs-CRP）是用检测灵敏性更高的方法所测得的CRP，最低检测限达0.1mg/L，常用乳胶增强免疫比浊法。",
            "免疫散射比浊法",
            130,
        ),
        "factors": (
            "hs-CRP是用检测灵敏性更高的方法所测得的CRP，以识别低水平但持续存在的炎症；健康人体内CRP水平通常<3mg/L，心血管疾病筛查时应使用高灵敏性方法检测。",
            "是用检测灵敏性更高的方法所测得的 CRP",
            311,
        ),
    },
    "tsh": {
        "principle": (
            "TSH采用化学发光免疫分析（CLIA法）检测，需新鲜血清或血浆。",
            "采用 CLIA 法检测",
            231,
        ),
        "factors": (
            "溶血、脂血对TSH测定干扰较大；TSH分泌存在昼夜节律，高峰在清晨2时至4时，低谷在下午5时至6时，一般在清晨起床前采血。",
            "TSH 的分泌存在昼夜节律",
            231,
        ),
    },
    "lipids": {
        "principle": (
            "总胆固醇常规方法为胆固醇氧化酶-过氧化物酶-4-氨基安替比林和酚法（CHOD-PAP）；甘油三酯常规方法为磷酸甘油氧化酶-过氧化物酶-4-氨基安替比林和酚法（GPO-PAP）。",
            "是临床实验室测定血浆 TC 的常规方法",
            186,
        ),
        "factors": (
            "酶法测定TC时，标本中血红蛋白浓度高于2g/L会引起正干扰；胆红素浓度高于0.1g/L时有明显负干扰；维生素C与甲基多巴胺浓度高于治疗水平时会使TC结果偏低。",
            "酶法测定 TC 时",
            187,
        ),
    },
}

doc = json.loads(PROF.read_text())
by_id = {a["itemId"]: a for a in doc["articles"]}

added = []
for item_id, spec in DATA.items():
    article = by_id.get(item_id)
    if not article:
        raise SystemExit(f"unknown itemId: {item_id}")
    existing = {s["title"] for s in article["sections"]}
    if "检验原理" in existing or "影响因素" in existing:
        raise SystemExit(f"{item_id} already has sections; refusing to duplicate")
    n = len(article["sections"])
    for key, title in (("principle", "检验原理"), ("factors", "影响因素")):
        text, quote, page = spec[key]
        n += 1
        article["sections"].append(
            {
                "id": f"section-{n}",
                "title": title,
                "claims": [
                    {
                        "id": f"{item_id}.professional.{n}",
                        "text": text,
                        "provenance": {
                            "kind": "document",
                            "sourceId": "biochem-2025",
                            "pdfPage": page,
                            "quote": quote,
                        },
                        "reviewStatus": "unreviewed",
                    }
                ],
            }
        )
        added.append(f"{item_id}/{title}→p{page}")

PROF.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
print(f"added {len(added)} sections:")
for line in added:
    print(" ", line)
