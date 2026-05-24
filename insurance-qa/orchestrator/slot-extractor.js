function extractAmount(query) {
  const q = String(query || "");
  const wan = q.match(/(\d+(?:\.\d+)?)\s*万/);
  if (wan) return Math.round(Number(wan[1]) * 10000);
  const yuan = q.match(/(\d+)\s*元/);
  if (yuan) return Number(yuan[1]);
  return null;
}

function extractDrugName(query) {
  const q = String(query || "");
  if (/奥希替尼|泰瑞沙/.test(q)) return "甲磺酸奥希替尼片";
  const match = q.match(/([\u4e00-\u9fa5A-Za-z0-9-]+)(?:能不能报|能报吗|能不能赔|能赔吗|能报销吗)/);
  return match ? match[1] : null;
}

function extractSlots(query) {
  const q = String(query || "");
  return {
    claim_amount: extractAmount(q),
    drug_name: extractDrugName(q),
    is_pre_existing: /不是既往症|非既往症/.test(q) ? false : /既往症/.test(q) ? true : null,
    local_medical_insurance_settled: /没走当地医保|未走当地医保|未经当地医保/.test(q)
      ? false
      : /已走当地医保|经过当地医保|经当地医保/.test(q)
        ? true
        : null,
    shanghai_medical_insurance_settled: /没走上海医保|未走上海医保|没用上海医保卡/.test(q)
      ? false
      : /上海医保卡实时结算|经上海医保|经过上海医保|上海基本医疗保险结算/.test(q)
        ? true
        : null,
    mutual_aid_subsidy_obtained: /还没有拿到互助帮困|未获得.*互助帮困|没拿到互助帮困/.test(q)
      ? false
      : /已获得.*互助帮困|拿到.*互助帮困/.test(q)
        ? true
        : null,
    prescription_months: /两个月|2个月/.test(q) ? 2 : /超过一个月/.test(q) ? 2 : null,
  };
}

module.exports = {
  extractSlots,
};

