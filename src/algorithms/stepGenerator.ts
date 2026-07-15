/**
 * LSM-Tree 读写流程 — 步骤生成器
 *
 * 动画展示 LSM-Tree 的核心机制：写请求先追加 WAL 再写入内存有序的
 * MemTable；MemTable 达到阈值后冻结为 Immutable 段并 flush 成 HFile；
 * 读请求按 MemTable → Level0 HFile → 更高层 HFile 的顺序逐层查找。
 * 体现 LSM 「写快读慢、靠 Compaction 合并」的设计权衡。
 */
import type { Step, VisualElement, VariableState } from '../types'

/** LSM-Tree 读写流程伪代码 */
export const TEMPLATE_CODE = `// LSM-Tree 写路径
public void write(byte[] key, byte[] value) {
    wal.append(key, value);          // 先写 WAL，保证持久
    memTable.add(key, value);        // 写入内存有序结构
    if (memTable.isFull()) {         // 达到 flush 阈值
        flushToImmutable(memTable);  // 冻结为不可变段
        flushToHFile(immutable);     // 刷盘生成 HFile (Level0)
    }
}

// LSM-Tree 读路径（按层级查找）
public byte[] read(byte[] key) {
    byte[] v = memTable.get(key);    // 1. 先查活跃 MemTable
    if (v != null) return v;
    v = searchHFiles(key);           // 2. 逐层查 HFile (L0->L1->...)
    return v;                        // 写快读慢，靠合并控制读放大
}`

// 画布布局常量
const LAYOUT = {
  wal: { x: 60, y: 80, w: 150, h: 70, label: 'WAL' },
  memtable: { x: 290, y: 80, w: 180, h: 90, label: 'MemTable' },
  immutable: { x: 290, y: 230, w: 180, h: 70, label: 'Immutable' },
  hfileL0: { x: 560, y: 80, w: 170, h: 90, label: 'HFile L0' },
  hfileL1: { x: 790, y: 80, w: 150, h: 90, label: 'HFile L1' },
  hdfs: { x: 560, y: 230, w: 380, h: 70, label: 'HDFS' },
}

function makeElements(highlight?: string): VisualElement[] {
  const mk = (
    key: keyof typeof LAYOUT,
    type: string,
    state: string,
    sub?: string
  ): VisualElement => {
    const l = LAYOUT[key]
    return {
      id: key,
      type,
      label: l.label,
      subLabel: sub,
      x: l.x,
      y: l.y,
      width: l.w,
      height: l.h,
      state: key === highlight ? 'active' : state,
    }
  }
  return [
    mk('wal', 'wal', 'idle', 'edits.log'),
    mk('memtable', 'memtable', 'idle', '[a,c,e]'),
    mk('immutable', 'memtable', 'idle', 'frozen'),
    mk('hfileL0', 'hfile', 'idle', 'HFile1'),
    mk('hfileL1', 'hfile', 'idle', 'HFile2'),
    mk('hdfs', 'hdfs', 'idle'),
  ]
}

export function generateSteps(): Step[] {
  const steps: Step[] = []
  let idx = 0

  const push = (
    desc: string,
    line: number,
    vars: VariableState[],
    elements: VisualElement[],
    arrows: { from: string; to: string; label?: string }[] = [],
    actionLabel?: string,
    statusText?: string
  ) => {
    steps.push({
      index: idx++,
      description: desc,
      currentLine: line,
      variables: vars,
      elements,
      connections: arrows.map((a, i) => ({
        id: `arrow-${i}`,
        fromId: a.from,
        toId: a.to,
        kind: 'arrow' as const,
        label: a.label,
      })),
      annotations: [],
      actionLabel,
      statusText: statusText ?? desc,
    })
  }

  // 步骤 0：LSM-Tree 拓扑总览
  push(
    'LSM-Tree 核心：WAL + MemTable(内存有序) + HFile(磁盘分层)，写只追加、读需多层合并',
    0,
    [
      { name: 'memTable', value: '[a,c,e]', line: 4, type: 'MemTable' },
      { name: 'flushThreshold', value: '64MB', line: 5, type: 'int' },
      { name: 'hfileLevel0', value: '[HFile1]', line: 7, type: 'List<HFile>' },
    ],
    makeElements(),
    [
      { from: 'memtable', to: 'hfileL0', label: 'flush' },
      { from: 'hfileL0', to: 'hdfs', label: '落盘' },
    ],
    'OVERVIEW',
    'LSM-Tree 总览'
  )

  // 步骤 1：写请求先追加 WAL
  push(
    '写请求到达：先追加 WAL（顺序写，保证宕机可恢复）',
    3,
    [
      { name: 'key', value: "'e'", line: 2, type: 'byte[]' },
      { name: 'wal', value: 'edits.log', line: 3, type: 'WAL' },
    ],
    makeElements('wal'),
    [{ from: 'wal', to: 'memtable', label: '1.WAL 先写' }],
    'WAL',
    '写 WAL'
  )

  // 步骤 2：写入 MemTable（保持有序）
  push(
    '写入 MemTable，保持按 Key 有序（底层 CellSkipListSet）',
    4,
    [
      { name: 'memTable', value: '[a,c,e]', line: 4, type: 'MemTable' },
      { name: 'memTable.size', value: '32MB / 64MB', line: 5 },
    ],
    makeElements('memtable'),
    [{ from: 'wal', to: 'memtable', label: '2.写 MemTable' }],
    'WRITE',
    '写 MemTable'
  )

  // 步骤 3：MemTable 满，冻结为 Immutable
  push(
    'MemTable 达到 flush 阈值(64MB)，冻结为不可变 Immutable 段，新 MemStore 接管写入',
    6,
    [
      { name: 'memTable.size', value: '64MB (满)', line: 5 },
      { name: 'immutable', value: '[a,c,e] frozen', line: 6, type: 'Immutable' },
    ],
    makeElements('immutable'),
    [{ from: 'memtable', to: 'immutable', label: '3.冻结' }],
    'FREEZE',
    '冻结 Immutable'
  )

  // 步骤 4：Flush 生成 HFile
  push(
    'Immutable 段 flush 成有序 HFile 落盘（Level0，可能存在重叠区间）',
    7,
    [
      { name: 'hfileLevel0', value: '[HFile1,HFile2]', line: 7, type: 'List<HFile>' },
      { name: 'hdfs', value: '/hdfs/.../HFile-2', line: 7, type: 'HDFS' },
    ],
    makeElements('hfileL0'),
    [
      { from: 'immutable', to: 'hfileL0', label: '4.flush' },
      { from: 'hfileL0', to: 'hdfs', label: '落盘' },
    ],
    'FLUSH',
    'Flush 生成 HFile'
  )

  // 步骤 5：读路径 — 先查活跃 MemTable
  push(
    '读请求：先查活跃 MemTable（内存命中即返回，最快）',
    11,
    [
      { name: 'key', value: "'c'", line: 10, type: 'byte[]' },
      { name: 'memTable.get', value: "'c'->v2", line: 11, type: 'byte[]' },
    ],
    makeElements('memtable'),
    [],
    'READ',
    '读：查 MemTable'
  )

  // 步骤 6：读路径 — 逐层查 HFile
  push(
    'MemTable 未命中，逐层查 HFile（L0 可能多文件需全扫，L1+ 有序可二分）',
    13,
    [
      { name: 'searchHFiles', value: 'L0->L1->L2', line: 13, type: 'byte[]' },
      { name: '读放大', value: '多层扫描', line: 14 },
    ],
    makeElements('hfileL0'),
    [
      { from: 'memtable', to: 'hfileL0', label: '5.L0' },
      { from: 'hfileL0', to: 'hfileL1', label: '6.L1' },
    ],
    'SEARCH',
    '读：查 HFile'
  )

  // 步骤 7：读完成 + 合并的意义
  push(
    '命中返回。LSM 写快读慢，靠 Compaction 合并 HFile 控制读放大',
    14,
    [
      { name: 'result', value: "'c'->v2 (命中L0)", line: 14, type: 'byte[]' },
      { name: 'compaction', value: '合并 L0->L1', line: 14, type: 'Compaction' },
    ],
    makeElements('hfileL0').map((e) => ({
      ...e,
      state: e.id === 'hfileL0' ? 'done' : e.state,
    })),
    [{ from: 'hfileL0', to: 'hfileL1', label: 'Compaction 合并' }],
    'DONE',
    '读完成'
  )

  return steps
}
