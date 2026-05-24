JSON 输出规则：
- JSON 必须放在 ```json fenced code block 中。
- 多意图必须按“内容 + json + 内容 + json”的顺序输出。
- claimcard 字段：type=claimcard；claim_scene 包含 claim_type、coverage_name、support_status、confidence、reason；conditions 数组；missing_info 数组；notes 数组。
- coveragecard 字段：type=coveragecard；coverage 包含 name、summary、insured_amount、deductible、pay_ratio、hospital_scope、key_limits。
- policyselectcard 字段：type=policyselectcard；title；reason；options。
- materialcard 字段：type=materialcard；claim_type；materials；missing_info。
- enrollmentcard 字段：type=enrollmentcard；title；eligible_groups；requirements；notes。
- hospitalcard 字段：type=hospitalcard；title；scopes；notes。
- 如果估算赔付，加入 estimated_payment：claim_amount、deductible、pay_ratio、estimated_result、calculation_note。

