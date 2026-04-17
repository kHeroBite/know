import { useState, useEffect, useCallback, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import {
  Typography, Button, Input, Select, Space, Popconfirm, message,
  Card, Row, Col, Progress, Modal, Form, Table, Radio,
  Alert, Checkbox, Divider, Spin, Tag,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, FolderOutlined,
  ImportOutlined, SearchOutlined, BookOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import { workspaceAPI } from '../api/workspace'
import 클라이언트 from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'

const { Title, Text } = Typography

function fmt날짜(dt?: string | null): string | null {
  if (!dt) return null
  try {
    const d = new Date(dt)
    if (isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${hh}:${mm}`
  } catch {
    return null
  }
}

// ─── DicColumn (DictionaryManage에서 이동) ────────────────────────

type DicType = 'udic' | 'cndic' | 'thesaurus'

const 사전설정: Record<DicType, { title: string; label: string }> = {
  udic: { title: '사용자사전', label: '사용자사전(udic)' },
  cndic: { title: '복합명사사전', label: '복합명사사전(cndic)' },
  thesaurus: { title: '유사어사전', label: '유사어사전(thesaurus)' },
}

function 사전컬럼(dicType: DicType) {
  return (삭제버튼: (r: any) => React.ReactNode) => {
    if (dicType === 'thesaurus') {
      return [
        { title: '키워드', dataIndex: 'head_word', key: 'head_word', ellipsis: true },
        { title: '유사어', dataIndex: 'tail_word', key: 'tail_word', ellipsis: true },
        { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
      ]
    }
    return [
      { title: '단어', dataIndex: 'word', key: 'word', ellipsis: true },
      { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true },
      { title: '', key: 'action', width: 50, render: (_: unknown, r: any) => 삭제버튼(r) },
    ]
  }
}

function DicColumn({ dicType, 선택도메인 }: { dicType: DicType; 선택도메인: string }) {
  const [데이터, set데이터] = useState<any[]>([])
  const [검색어, set검색어] = useState('')
  const [검색쿼리, set검색쿼리] = useState('')
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [총건수, set총건수] = useState(0)
  const [현재페이지, set현재페이지] = useState(1)
  const [form] = Form.useForm()
  const cfg = 사전설정[dicType]

  const 데이터조회 = useCallback(async () => {
    if (!선택도메인) return
    set로딩(true)
    try {
      const 경로 = dicType === 'thesaurus' ? 'thesaurus/list' : dicType
      const res = await 클라이언트.get(`/dictionaries/${선택도메인}/${경로}`, {
        params: { page: 현재페이지, size: 50, ...(검색쿼리 ? { search: 검색쿼리 } : {}) },
      })
      set데이터(res.data?.items || [])
      set총건수(res.data?.total || 0)
    } catch {
      message.error(`${cfg.title} 조회 실패`)
    } finally {
      set로딩(false)
    }
  }, [선택도메인, dicType, 현재페이지, 검색쿼리])

  useEffect(() => {
    const timer = setTimeout(() => { set검색쿼리(검색어); set현재페이지(1) }, 100)
    return () => clearTimeout(timer)
  }, [검색어])

  useEffect(() => { if (선택도메인) 데이터조회() }, [선택도메인, 데이터조회])

  const 삭제 = async (record: any) => {
    try {
      const word = dicType === 'thesaurus' ? record.head_word : record.word
      await 클라이언트.delete(`/dictionaries/${선택도메인}/${dicType}/${encodeURIComponent(word)}`)
      message.success('삭제 완료')
      데이터조회()
    } catch { message.error('삭제 실패') }
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      await 클라이언트.post(`/dictionaries/${선택도메인}/${dicType}`, values)
      message.success('추가 완료')
      set모달열림(false)
      form.resetFields()
      데이터조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('추가 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally { set저장중(false) }
  }

  const 삭제버튼 = (record: any) => (
    <Popconfirm title="삭제?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
      <Button size="small" icon={<DeleteOutlined />} danger type="text" />
    </Popconfirm>
  )

  const columns = 사전컬럼(dicType)(삭제버튼)

  const 모달폼내용 = () => {
    if (dicType === 'thesaurus') {
      return (<>
        <Form.Item name="head_word" label="키워드" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="tail_word" label="유사어" rules={[{ required: true }]}><Input /></Form.Item>
      </>)
    }
    return (<>
      <Form.Item name="word" label="단어" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="memo" label="메모"><Input /></Form.Item>
    </>)
  }

  return (
    <Card title={cfg.title} size="small" extra={
      <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); set모달열림(true) }}>추가</Button>
    }>
      <Input placeholder="검색..." value={검색어} onChange={e => set검색어(e.target.value)} allowClear size="small" prefix={<SearchOutlined />} style={{ marginBottom: 8 }} />
      <Table dataSource={데이터} columns={columns} rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'} loading={로딩} size="small" scroll={{ y: 400 }}
        pagination={{ current: 현재페이지, pageSize: 50, total: 총건수, showTotal: (total) => `총 ${total.toLocaleString()}건`, showSizeChanger: false, size: 'small', onChange: (page) => set현재페이지(page) }}
      />
      <Modal title={`${cfg.label} 추가`} open={모달열림} onOk={저장} onCancel={() => set모달열림(false)} confirmLoading={저장중} okText="저장" cancelText="취소">
        <Form form={form} layout="vertical">{모달폼내용()}</Form>
      </Modal>
    </Card>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────

export default function DomainManage() {
  const { user: currentUser } = useAuthStore()
  const isSuper = currentUser?.auth === 'A'
  const { isBlocked, currentTask, executeDomainAdd, cancelDomainAdd, executeDomainDelete, restoreDomainPolling } = useGlobalTaskStore()

  // 도메인 목록
  const [도메인목록, set도메인목록] = useState<{id: string, name: string | null, last_work_at?: string | null}[]>([])
  const [워크스페이스목록, set워크스페이스목록] = useState<any[]>([])
  const [로딩, set로딩] = useState(false)

  // 도메인 추가
  const [도메인추가팝업, set도메인추가팝업] = useState(false)
  const [도메인신규이름, set도메인신규이름] = useState('')
  const [도메인소스타입, set도메인소스타입] = useState<'domain' | 'old'>('domain')
  const [도메인소스이름, set도메인소스이름] = useState<string | null>(null)
  const [old소스목록, setOld소스목록] = useState<string[]>([])
  const [도메인추가로딩, set도메인추가로딩] = useState(false)
  const [도메인표시이름, set도메인표시이름] = useState('')
  const [사전복사모드, set사전복사모드] = useState<'none' | 'sqlite' | 'mysql'>('none')
  const [사전복사소스, set사전복사소스] = useState<string | null>(null)
  const [mysql소스목록, setMysql소스목록] = useState<string[]>([])
  const [복사소스사전건수, set복사소스사전건수] = useState<{udic: number, cndic: number, thesaurus: number, category: number} | null>(null)
  const 도메인이름입력ref = useRef<any>(null)

  // 이름 변경 (display_name 전용 — 도메인ID는 고정)
  const [이름변경대상, set이름변경대상] = useState<{id: string, name: string | null} | null>(null)
  const [변경후이름, set변경후이름] = useState('')

  // 사전관리 선택
  const [사전도메인, set사전도메인] = useState<string | null>(null)
  const [dicKey, setDicKey] = useState(0)

  // 형태소분석
  const [형태소도메인, set형태소도메인] = useState<string | null>(null)
  const [형태소입력, set형태소입력] = useState('')
  const [형태소로딩Lite, set형태소로딩Lite] = useState(false)
  const [형태소로딩Full, set형태소로딩Full] = useState(false)
  const [형태소로딩유사어, set형태소로딩유사어] = useState(false)
  const [형태소결과Lite, set형태소결과Lite] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [형태소결과Full, set형태소결과Full] = useState<{keyword: string; result: string; tokens: string[]} | null>(null)
  const [유사어결과, set유사어결과] = useState<{head_word: string; tail_word: string}[] | null>(null)

  // 임포트
  const [임포트모달, set임포트모달] = useState(false)
  type DictDiff = {
    file: number
    db: number
    new: number | null
    modified: number | null   // key 있음/value 다름 → overwrite 시 UPDATE
    same: number | null       // key+value 완전 일치
    duplicate: number | null  // modified + same (기존 호환)
    targets?: { create: number | null; overwrite: number | null; append: number | null }
  }
  const [파일건수, set파일건수] = useState<{
    udic: number
    cndic: number
    thesaurus: number
    file?: { udic: number; cndic: number; thesaurus: number }
    db?: { udic: number; cndic: number; thesaurus: number }
    diff?: { udic: DictDiff; cndic: DictDiff; thesaurus: DictDiff }
  } | null>(null)
  const [임포트중, set임포트중] = useState(false)
  const [진행률, set진행률] = useState<{percent: number; stage: string; status: string; current: number} | null>(null)
  const [임포트옵션, set임포트옵션] = useState({udic: true, cndic: true, thesaurus: true})
  const [임포트모드, set임포트모드] = useState<'create' | 'overwrite' | 'append'>('append')

  // store에서 직접 파생: 현재 도메인 복사 진행 중인 항목
  // done 상태도 포함: _finishTask 후 2초 딜레이 동안 100%로 표시
  const 도메인복사진행중: Record<string, number> = (() => {
    if (!currentTask) return {}
    if (currentTask.status !== 'running' && currentTask.status !== 'done') return {}
    const match = currentTask.id.match(/^domain-add-(.+?)-\d+$/)
    if (!match) return {}
    const pct = currentTask.status === 'done' ? 100 : currentTask.percent
    return { [match[1]]: pct }
  })()

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [dmRes, wsRes] = await Promise.all([
        workspaceAPI.도메인목록(),
        workspaceAPI.워크스페이스목록(),
      ])
      set도메인목록(dmRes.data)
      set워크스페이스목록(wsRes.data)
      // 페이지 복귀 시 진행 중인 도메인 폴링 복원 (store에 위임)
      await restoreDomainPolling(dmRes.data)
    } catch {
      message.error('목록 조회 실패')
    } finally { set로딩(false) }
  }

  useEffect(() => { 목록조회() }, [])

  // domain-add task 완료 시 목록 갱신 (WS로 done 수신 시 onDone 콜백 미실행 케이스 보완)
  const 이전태스크ID = useRef<string | null>(null)
  useEffect(() => {
    if (!currentTask) { 이전태스크ID.current = null; return }
    if (!currentTask.id.startsWith('domain-add-')) return
    if (이전태스크ID.current === currentTask.id) return
    if (currentTask.status === 'done' || currentTask.status === 'error' || currentTask.status === 'cancelled') {
      이전태스크ID.current = currentTask.id
      if (currentTask.status !== 'cancelled') 목록조회()
    }
  }, [currentTask])

  // 임포트
  const 임포트모달열기 = async () => {
    if (!사전도메인) return
    set임포트모달(true); set파일건수(null); set진행률(null)
    set임포트옵션({udic: true, cndic: true, thesaurus: true}); set임포트모드('append')
    try { const res = await 클라이언트.get(`/dictionaries/${사전도메인}/file-preview`); set파일건수(res.data) } catch { set파일건수(null) }
  }

  const 작업대상계산 = (key: 'udic' | 'cndic' | 'thesaurus'): number => {
    const 파일 = 파일건수?.file ?? { udic: 파일건수?.udic ?? 0, cndic: 파일건수?.cndic ?? 0, thesaurus: 파일건수?.thesaurus ?? 0 }
    const d = 파일건수?.diff?.[key]
    if (!d) {
      const file = 파일[key] ?? 0
      switch (임포트모드) {
        case 'create': return file
        case 'overwrite': return file
        case 'append': return 0
      }
    }
    const t = d.targets
    if (t && t[임포트모드] !== null && t[임포트모드] !== undefined) return t[임포트모드]!
    // fallback: targets 필드 없을 때 (호환)
    const file = 파일[key] ?? 0
    const new_ = d.new ?? 0
    switch (임포트모드) {
      case 'create': return file
      case 'overwrite': return file
      case 'append': return new_
    }
  }

  const 임포트실행 = async () => {
    if (!사전도메인) return
    if (임포트모드 === 'append') {
      const 총작업대상 = (['udic', 'cndic', 'thesaurus'] as const)
        .filter(k => 임포트옵션[k])
        .reduce((sum, k) => sum + 작업대상계산(k), 0)
      if (총작업대상 === 0) {
        message.info('추가할 신규 항목이 없습니다. 즉시 완료되었습니다.')
        set임포트모달(false)
        return
      }
    }
    const taskId = `domain-import-${Date.now()}`
    const { _startTask, _updateProgress, _finishTask } = useGlobalTaskStore.getState()
    const started = _startTask({ id: taskId, type: '도메인 파일 임포트', label: `${사전도메인} 사전 임포트 중`, percent: 0, status: 'running' })
    if (!started) { message.warning('이미 다른 작업이 진행 중입니다'); return }
    set임포트중(true); set진행률({ percent: 0, stage: 'preparing', status: 'running', current: 0 })
    try {
      await 클라이언트.post(`/dictionaries/${사전도메인}/import-from-files?udic=${임포트옵션.udic}&cndic=${임포트옵션.cndic}&thesaurus=${임포트옵션.thesaurus}&mode=${임포트모드}`)
      const poll = setInterval(async () => {
        try {
          const res = await 클라이언트.get(`/dictionaries/${사전도메인}/import-progress`)
          set진행률(res.data)
          const percent: number = res.data.percent ?? 0
          _updateProgress(taskId, percent)
          if (res.data.status === 'done' || res.data.status === 'error' || res.data.status === 'cancelled') {
            clearInterval(poll); set임포트중(false)
            if (res.data.status === 'done') {
              _finishTask(taskId, 'done')
              const r = res.data.result
              const fmt = (d: any) => {
                if (typeof d === 'number') return `${d}건`
                const parts: string[] = []
                if (d.inserted) parts.push(`추가 ${d.inserted}`)
                if (d.updated) parts.push(`수정 ${d.updated}`)
                if (d.skipped) parts.push(`스킵 ${d.skipped}`)
                return parts.length ? parts.join('/') : '0건'
              }
              message.success(`임포트 완료: 사용자사전(${fmt(r.udic)}), 복합명사(${fmt(r.cndic)}), 유사어(${fmt(r.thesaurus)})`)
              setDicKey(k => k + 1)
              setTimeout(() => set임포트모달(false), 1500)
            }
            if (res.data.status === 'cancelled') {
              _finishTask(taskId, 'cancelled')
              message.info('임포트가 취소되었습니다')
              setDicKey(k => k + 1)
              setTimeout(() => set임포트모달(false), 1000)
            }
            if (res.data.status === 'error') {
              _finishTask(taskId, 'error')
              message.error('임포트 실패: ' + (res.data.result?.error || '알 수 없는 오류'))
            }
          }
        } catch { /* polling error */ }
      }, 1000)
    } catch (e: any) {
      _finishTask(taskId, 'error')
      set임포트중(false)
      message.error(e?.response?.data?.detail || '임포트 시작 실패')
    }
  }

  const 단계라벨 = (stage: string) => {
    // 사전 타입
    const 사전이름: Record<string, string> = { udic: '사용자사전', cndic: '복합명사사전', thesaurus: '유사어사전' }
    // stage 형식: {dic_type} 또는 {dic_type}_{작업}
    if (!stage || stage === 'preparing') return '준비 중'
    if (사전이름[stage]) return 사전이름[stage]
    const match = stage.match(/^(udic|cndic|thesaurus)_(.+)$/)
    if (match) {
      const [, 타입, 작업] = match
      const 작업라벨: Record<string, string> = {
        reading: '파일 읽는 중',
        loading_db: 'DB 대조 준비',
        matching: '신규/중복 대조 중',
        deleting: '기존 삭제 중',
        inserting: '신규 추가 중',
        updating: '변경 항목 반영 중',
      }
      return `${사전이름[타입]} — ${작업라벨[작업] || 작업}`
    }
    return stage
  }

  const 임포트취소 = async () => {
    if (!사전도메인 || !임포트중) return
    Modal.confirm({
      title: '임포트 중지',
      content: '현재 진행 중인 사전 임포트 작업을 중지하시겠습니까? 이미 반영된 일부 변경사항은 롤백됩니다.',
      okText: '중지',
      okButtonProps: { danger: true },
      cancelText: '계속 진행',
      onOk: async () => {
        try {
          await 클라이언트.post(`/dictionaries/${사전도메인}/cancel-import`)
          message.info('중지 요청을 전송했습니다. 곧 작업이 중단됩니다.')
        } catch (e: any) {
          message.error(e?.response?.data?.detail || '중지 요청 실패')
        }
      },
    })
  }

  const 형태소분석실행 = async () => {
    const kw = 형태소입력.trim()
    if (!kw || !형태소도메인) return
    set형태소결과Lite(null)
    set형태소결과Full(null)
    set유사어결과(null)
    set형태소로딩Lite(true)
    set형태소로딩Full(true)
    set형태소로딩유사어(true)
    // 3개 병렬 호출
    const litePromise = 클라이언트.post('/morpheme/analyze', { keyword: kw, domain: 형태소도메인, skip_workspace: true })
      .then(r => set형태소결과Lite(r.data))
      .catch(() => set형태소결과Lite({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Lite(false))
    const fullPromise = 클라이언트.post('/morpheme/analyze-full', { keyword: kw, domain: 형태소도메인, skip_workspace: true })
      .then(r => set형태소결과Full(r.data))
      .catch(() => set형태소결과Full({ keyword: kw, result: '분석 실패', tokens: [] }))
      .finally(() => set형태소로딩Full(false))
    const synPromise = 클라이언트.get(`/dictionaries/${형태소도메인}/thesaurus/list`, { params: { search: kw, size: 30 } })
      .then(r => set유사어결과(r.data?.items || []))
      .catch(() => set유사어결과([]))
      .finally(() => set형태소로딩유사어(false))
    await Promise.all([litePromise, fullPromise, synPromise])
  }

  return (
    <div>
      <PageHeader title="도메인 관리" />

      {/* ─── 도메인 목록 ─── */}
      <Card
        loading={로딩}
        extra={isSuper && (
          <Button type="primary" size="small" icon={<PlusOutlined />} disabled={isBlocked} onClick={async () => {
            set도메인추가팝업(true); set사전복사모드('none'); set사전복사소스(null)
            try {
              const [oldRes, mysqlRes] = await Promise.all([workspaceAPI.old도메인소스목록(), workspaceAPI.mysql도메인소스목록()])
              setOld소스목록(oldRes.data); setMysql소스목록(mysqlRes.data)
            } catch { /* ignore */ }
          }}>도메인 추가</Button>
        )}
      >
        {/* 진행률 */}
        {Object.entries(도메인복사진행중).map(([dm, pct]) => (
          <div key={dm} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12 }}>{currentTask?.label || `${dm} 추가 중`}</Text>
            <Progress percent={pct} size="small" status="active" style={{ maxWidth: 300, display: 'inline-block', flex: 1 }} />
            <Button size="small" danger onClick={async () => {
              await cancelDomainAdd(dm)
              message.info(`${dm} 도메인 추가 취소 요청됨`)
            }}>취소</Button>
          </div>
        ))}

        <Row gutter={[16, 16]}>
          {도메인목록.map(dm => {
            const 연결WS = 워크스페이스목록.find((ws: any) => ws.domain === dm.id && (ws.status === 'USED' || ws.status === 'CONNECTING'))
            const 연결됨 = !!연결WS
            const 선택됨 = 사전도메인 === dm.id
            return (
              <Col xs={24} sm={12} key={dm.id}>
                <Card
                  style={{
                    borderColor: 선택됨 ? '#1677ff' : 연결됨 ? '#52c41a' : '#d9d9d9',
                    borderWidth: 선택됨 ? 2 : 1,
                    borderStyle: 'solid',
                  }}
                  styles={{ body: { padding: 16 } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div>
                      <Text strong style={{ fontSize: 15 }}>{dm.name ? dm.name : dm.id}</Text>
                      {dm.name && <Text type="secondary" style={{ fontSize: 12 }}> ({dm.id})</Text>}
                    </div>
                    {연결됨 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>워크스페이스: {연결WS.name}</Text>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12, color: '#999' }}>미연결</Text>
                    )}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      최근 작업: {fmt날짜(dm.last_work_at) ?? '없음'}
                    </Text>
                  </div>
                  <Space size={8}>
                    <Button icon={<BookOutlined />} type={선택됨 ? 'primary' : 'default'}
                      disabled={isBlocked}
                      onClick={() => { set사전도메인(선택됨 ? null : dm.id); setDicKey(k => k + 1) }}
                    >사전 관리</Button>
                    <Button icon={<ExperimentOutlined />}
                      type={형태소도메인 === dm.id ? 'primary' : 'default'}
                      disabled={isBlocked}
                      onClick={() => {
                        set형태소도메인(형태소도메인 === dm.id ? null : dm.id)
                        set형태소입력('')
                        set형태소결과Lite(null)
                        set형태소결과Full(null)
                        set유사어결과(null)
                      }}
                    >형태소분석</Button>
                    {isSuper && <>
                      <Button icon={<EditOutlined />} disabled={연결됨}
                        onClick={() => { set이름변경대상(dm); set변경후이름(dm.name ?? '') }}>이름 변경</Button>
                      <Popconfirm title={`도메인 "${dm.id}"을 삭제하시겠습니까?`} onConfirm={async () => {
                        await executeDomainDelete(dm.id, {
                          onDone: async () => {
                            message.success(`도메인 "${dm.id}" 삭제 완료`)
                            if (사전도메인 === dm.id) set사전도메인(null)
                            await 목록조회()
                          },
                          onError: (err) => {
                            message.error(err || '삭제 실패')
                          },
                        })
                      }} okText="삭제" cancelText="취소">
                        <Button danger icon={<DeleteOutlined />} disabled={연결됨 || isBlocked}>삭제</Button>
                      </Popconfirm>
                    </>}
                  </Space>
                </Card>
              </Col>
            )
          })}
          {도메인목록.length === 0 && <Col span={24}><Text type="secondary">도메인이 없습니다</Text></Col>}
        </Row>
      </Card>

      {/* ─── 사전 관리 영역 ─── */}
      {사전도메인 && (
        <>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}><BookOutlined /> {사전도메인} 사전 관리</Title>
            <Button icon={<ImportOutlined />} disabled={isBlocked} onClick={임포트모달열기}>파일에서 가져오기</Button>
          </div>
          <Row gutter={16} key={dicKey}>
            <Col span={8}><DicColumn dicType="udic" 선택도메인={사전도메인} /></Col>
            <Col span={8}><DicColumn dicType="cndic" 선택도메인={사전도메인} /></Col>
            <Col span={8}><DicColumn dicType="thesaurus" 선택도메인={사전도메인} /></Col>
          </Row>
        </>
      )}

      {/* ─── 형태소분석 영역 ─── */}
      {형태소도메인 && (
        <>
          <Divider />
          <Title level={5} style={{ margin: '0 0 12px' }}><ExperimentOutlined /> {형태소도메인} 형태소분석</Title>
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Input
              placeholder="분석할 키워드 입력"
              value={형태소입력}
              onChange={e => set형태소입력(e.target.value)}
              onPressEnter={형태소분석실행}
              allowClear
              style={{ maxWidth: 400 }}
            />
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              onClick={형태소분석실행}
              loading={형태소로딩Lite || 형태소로딩Full || 형태소로딩유사어}
              disabled={!형태소입력.trim()}
            >분석</Button>
          </Space.Compact>
          <Row gutter={[16, 16]}>
            {/* Lite 분석 */}
            <Col xs={24} md={8}>
              <Card title="Lite 형태소분석" size="small" style={{ minHeight: 200 }}>
                {형태소로딩Lite ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : 형태소결과Lite ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>키워드: </Text>
                      <Text strong>{형태소결과Lite.keyword}</Text>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      {형태소결과Lite.tokens.length > 0
                        ? 형태소결과Lite.tokens.map((t, i) => (
                            <Tag key={i} color="blue" style={{ marginBottom: 4 }}>{t}</Tag>
                          ))
                        : <Text type="secondary">결과 없음</Text>
                      }
                    </div>
                    {형태소결과Lite.result && (
                      <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                        {형태소결과Lite.result}
                      </pre>
                    )}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                )}
              </Card>
            </Col>
            {/* Full 분석 */}
            <Col xs={24} md={8}>
              <Card title="Full 형태소분석 (품사 포함)" size="small" style={{ minHeight: 200 }}>
                {형태소로딩Full ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : 형태소결과Full ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>키워드: </Text>
                      <Text strong>{형태소결과Full.keyword}</Text>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      {형태소결과Full.tokens.length > 0
                        ? 형태소결과Full.tokens.map((t, i) => (
                            <Tag key={i} color="purple" style={{ marginBottom: 4 }}>{t}</Tag>
                          ))
                        : <Text type="secondary">결과 없음</Text>
                      }
                    </div>
                    {형태소결과Full.result && (
                      <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                        {형태소결과Full.result}
                      </pre>
                    )}
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                )}
              </Card>
            </Col>
            {/* 유사어 확장 */}
            <Col xs={24} md={8}>
              <Card title="유사어 확장 (사전 기반)" size="small" style={{ minHeight: 200 }}>
                {형태소로딩유사어 ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                ) : 유사어결과 ? (
                  유사어결과.length > 0 ? (
                    <div>
                      {유사어결과.map((s, i) => (
                        <div key={i} style={{ marginBottom: 4, fontSize: 13 }}>
                          <Tag color="green">{s.head_word}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>→ {s.tail_word}</Text>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>유사어 없음 (사전에 등록된 항목 없음)</Text>
                  )
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>키워드를 입력 후 분석하세요</Text>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ─── 이름 변경 모달 (display_name 전용 — 도메인 ID 고정) ─── */}
      <Modal title="도메인 이름 변경" open={!!이름변경대상}
        onOk={async () => {
          if (!이름변경대상) return
          try {
            await workspaceAPI.도메인표시이름변경(이름변경대상.id, 변경후이름.trim())
            message.success('이름 변경 완료')
            set이름변경대상(null); set변경후이름('')
            await 목록조회()
          }
          catch (err: any) { message.error(err.response?.data?.detail || '이름 변경 실패') }
        }}
        onCancel={() => { set이름변경대상(null); set변경후이름('') }} okText="변경" cancelText="취소">
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={8}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>도메인 ID (변경 불가)</Text>
            <Input value={이름변경대상?.id ?? ''} disabled style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>표시 이름 (한글 가능, 비우면 ID로 표시)</Text>
            <Input
              placeholder="새 표시 이름 입력"
              value={변경후이름}
              onChange={e => set변경후이름(e.target.value)}
              style={{ marginTop: 4 }}
              autoFocus
            />
          </div>
        </Space>
      </Modal>

      {/* ─── 도메인 추가 모달 ─── */}
      <Modal title="도메인 추가" open={도메인추가팝업}
        onOk={async () => {
          if (!도메인신규이름.trim() || !도메인소스이름) { message.warning('이름과 소스를 모두 입력하세요'); return }
          if (!도메인표시이름.trim()) { message.warning('도메인 한글명(표시이름)을 입력하세요'); return }
          set도메인추가로딩(true)
          const dmName = 도메인신규이름.trim()
          set도메인추가팝업(false); set도메인신규이름(''); set도메인표시이름(''); set도메인소스이름(null); set사전복사모드('none'); set사전복사소스(null); set복사소스사전건수(null)
          await executeDomainAdd(dmName, {
            base_source: 도메인소스타입,
            base_name: 도메인소스이름,
            copy_dict_from: 사전복사모드 === 'sqlite' ? 사전복사소스 : null,
            mysql_dict_from: 사전복사모드 === 'mysql' ? 사전복사소스 : null,
            display_name: 도메인표시이름.trim() || undefined,
          }, {
            onDone: async () => {
              message.success(`도메인 "${dmName}" 추가 완료`)
              await 목록조회()
            },
            onCancel: () => {
              message.info(`도메인 "${dmName}" 추가 취소됨`)
            },
            onError: (err) => {
              message.error(err || '도메인 추가 실패')
            },
          })
          set도메인추가로딩(false)
        }}
        onCancel={() => { set도메인추가팝업(false); set도메인신규이름(''); set도메인표시이름(''); set도메인소스이름(null); set사전복사모드('none'); set사전복사소스(null); set복사소스사전건수(null) }}
        okText="추가" cancelText="취소" confirmLoading={도메인추가로딩} okButtonProps={{ disabled: !도메인신규이름.trim() || !도메인소스이름 || !도메인표시이름.trim() || !/^[A-Za-z0-9_.]+$/.test(도메인신규이름.trim()) }}>
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          {/* 순서: 소스타입(3) → 소스선택(4) → 도메인ID(2) → 표시이름(1) */}
          <Select style={{ width: '100%' }} value={도메인소스타입} onChange={v => {
            set도메인소스타입(v)
            set도메인소스이름(null)
            set사전복사소스(null)
            set복사소스사전건수(null)
            set사전복사모드(v === 'domain' ? 'sqlite' : 'mysql')
          }}
            options={[{ label: '현재 도메인에서 복사', value: 'domain' }, { label: '이전 도메인에서 복사', value: 'old' }]} />
          <Select style={{ width: '100%' }} placeholder="소스 선택" showSearch
            options={도메인소스타입 === 'old'
              ? (old소스목록 || []).map(d => ({ label: d, value: d }))
              : 도메인목록.map(d => ({ label: d.name ? `${d.name} (${d.id})` : d.id, value: d.id }))}
            onChange={async v => {
              set도메인소스이름(v)
              set도메인신규이름(v)
              if (도메인소스타입 === 'domain') {
                const 존재 = 도메인목록.some(d => d.id === v)
                set사전복사소스(존재 ? v : null)
                set사전복사모드('sqlite')
              } else {
                const 존재 = mysql소스목록.includes(v)
                set사전복사소스(존재 ? v : null)
                set사전복사모드('mysql')
              }
              // 사전 건수 조회 (소스타입에 따라 SQLite or MySQL)
              set복사소스사전건수(null)
              try {
                if (도메인소스타입 === 'domain') {
                  const res = await 클라이언트.get(`/dictionaries/${v}/file-preview`)
                  set복사소스사전건수(res.data.db ?? { udic: 0, cndic: 0, thesaurus: 0, category: 0 })
                } else {
                  const res = await 클라이언트.get(`/dictionaries/${v}/mysql-count`)
                  set복사소스사전건수(res.data)
                }
              } catch { /* 조회 실패 시 무시 */ }
              // 도메인ID 입력란으로 포커싱
              setTimeout(() => 도메인이름입력ref.current?.focus(), 50)
            }} value={도메인소스이름} />

          <Input ref={도메인이름입력ref} placeholder="도메인 ID (영문자/숫자/언더스코어만, 필수)"
            value={도메인신규이름}
            onChange={e => set도메인신규이름(e.target.value)}
            autoComplete="off"
            status={도메인신규이름 && !/^[A-Za-z0-9_.]+$/.test(도메인신규이름) ? 'error' : undefined} />
          {도메인신규이름 && !/^[A-Za-z0-9_.]+$/.test(도메인신규이름) && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>영문자/숫자/언더스코어(_)/점(.)만 허용됩니다 (한글, 공백 등 불가)</Typography.Text>
          )}
          <Input placeholder="도메인 한글명 (필수)" value={도메인표시이름} onChange={e => set도메인표시이름(e.target.value)} autoComplete="off" status={도메인표시이름 !== undefined && 도메인신규이름.trim() && !도메인표시이름.trim() ? 'warning' : undefined} />
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>사전 복사 옵션</Text>
            <Radio.Group value={사전복사모드} onChange={e => {
              const newMode = e.target.value
              set사전복사모드(newMode)
              if (newMode === 'sqlite' && 도메인소스이름) {
                const 존재 = 도메인목록.some(d => d.id === 도메인소스이름)
                set사전복사소스(존재 ? 도메인소스이름 : null)
              } else if (newMode === 'mysql' && 도메인소스이름) {
                const 존재 = mysql소스목록.includes(도메인소스이름)
                set사전복사소스(존재 ? 도메인소스이름 : null)
              } else {
                set사전복사소스(null)
              }
            }} size="small">
              <Radio value="none">복사 안 함</Radio>
              <Radio value="sqlite">현재 사전</Radio>
              <Radio value="mysql">이전 사전 (MySQL)</Radio>
            </Radio.Group>
          </div>
          {사전복사모드 === 'sqlite' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select style={{ width: 280 }} placeholder="사전 복사할 기존 도메인 선택"
                options={도메인목록.map(d => ({ label: d.name ? `${d.name} (${d.id})` : d.id, value: d.id }))}
                onChange={async v => {
                  set사전복사소스(v)
                  set복사소스사전건수(null)
                  try {
                    const res = await 클라이언트.get(`/dictionaries/${v}/file-preview`)
                    set복사소스사전건수(res.data.db ?? { udic: 0, cndic: 0, thesaurus: 0, category: 0 })
                  } catch { /* 무시 */ }
                }} value={사전복사소스} />  {/* sqlite는 항상 SQLite DB 건수 */}
              {사전복사소스 && 복사소스사전건수 && (
                <Text style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#666' }}>
                  👤{복사소스사전건수.udic.toLocaleString()} 📚{복사소스사전건수.cndic.toLocaleString()} 🔗{복사소스사전건수.thesaurus.toLocaleString()} 📂{복사소스사전건수.category.toLocaleString()}
                </Text>
              )}
            </div>
          )}
          {사전복사모드 === 'mysql' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select style={{ width: 280 }} placeholder="MySQL 도메인 선택" showSearch
                options={mysql소스목록.map(d => ({ label: d, value: d }))}
                onChange={async v => {
                  set사전복사소스(v)
                  set복사소스사전건수(null)
                  try {
                    const res = await 클라이언트.get(`/dictionaries/${v}/mysql-count`)
                    set복사소스사전건수(res.data)
                  } catch { /* 무시 */ }
                }} value={사전복사소스} />  {/* mysql은 항상 MySQL 건수 */}
              {사전복사소스 && 복사소스사전건수 && (
                <Text style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#666' }}>
                  👤{복사소스사전건수.udic.toLocaleString()} 📚{복사소스사전건수.cndic.toLocaleString()} 🔗{복사소스사전건수.thesaurus.toLocaleString()} 📂{복사소스사전건수.category.toLocaleString()}
                </Text>
              )}
            </div>
          )}
        </Space>
      </Modal>

      {/* ─── 사전 임포트 모달 ─── */}
      <Modal title="파일에서 사전 가져오기" open={임포트모달}
        onCancel={() => !임포트중 && set임포트모달(false)} width={860} closable={!임포트중} maskClosable={false}
        footer={임포트중 ? [
          <Button key="cancel-import" danger onClick={임포트취소}>중지</Button>,
        ] : [
          <Button key="cancel" onClick={() => set임포트모달(false)}>취소</Button>,
          <Button key="ok" type="primary" danger={임포트모드 === 'create'} onClick={임포트실행}
            disabled={!파일건수 || (!임포트옵션.udic && !임포트옵션.cndic && !임포트옵션.thesaurus)}>
            {{ create: '새로 생성', overwrite: '덮어쓰기', append: '추가하기' }[임포트모드]}
          </Button>,
        ]}>
        {!임포트중 && 파일건수 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>임포트 방식</Text>
              <Radio.Group value={임포트모드} onChange={e => set임포트모드(e.target.value)}>
                <Space direction="vertical">
                  <Radio value="create">새로생성 — 기존 데이터 삭제 후 새로 등록</Radio>
                  <Radio value="overwrite">덮어쓰기 — 기존 데이터 유지, 동일 키워드 업데이트</Radio>
                  <Radio value="append">추가하기 — 기존 데이터 유지, 새 키워드만 추가</Radio>
                </Space>
              </Radio.Group>
            </div>
            {임포트모드 === 'create' && <Alert message="⚠️ 기존 DB 데이터를 모두 삭제하고 파일에서 다시 등록합니다. 복구 불가." type="warning" showIcon style={{ marginBottom: 16 }} />}
            {임포트모드 === 'overwrite' && <Alert message="파일 전체를 DB에 반영합니다. 동일 키는 덮어쓰기, 신규 키는 추가. 작업대상=파일 전체" type="info" showIcon style={{ marginBottom: 16 }} />}
            {임포트모드 === 'append' && <Alert message="기존 데이터를 유지하고 신규 키만 추가합니다. 작업대상=신규 건수만" type="info" showIcon style={{ marginBottom: 16 }} />}
            {(() => {
              const 파일 = 파일건수.file ?? { udic: 파일건수.udic, cndic: 파일건수.cndic, thesaurus: 파일건수.thesaurus }
              const DB = 파일건수.db ?? { udic: 0, cndic: 0, thesaurus: 0 }
              const diffMap = 파일건수.diff
              const 변경후 = (key: 'udic' | 'cndic' | 'thesaurus', 선택: boolean): number => {
                if (!선택) return DB[key]
                const d = diffMap?.[key]
                switch (임포트모드) {
                  case 'create': return 파일[key]
                  case 'overwrite':
                  case 'append': return (DB[key] ?? 0) + (d?.new ?? 0)
                }
                return DB[key]
              }
              const 작업대상 = (key: 'udic' | 'cndic' | 'thesaurus'): number => {
                const d = diffMap?.[key]
                if (!d) {
                  const file = 파일[key] ?? 0
                  switch (임포트모드) {
                    case 'create': return file
                    case 'overwrite': return file
                    case 'append': return 0
                  }
                }
                const t = d.targets
                if (t && t[임포트모드] !== null && t[임포트모드] !== undefined) return t[임포트모드]!
                const file = 파일[key] ?? 0
                const new_ = d.new ?? 0
                switch (임포트모드) {
                  case 'create': return file
                  case 'overwrite': return file
                  case 'append': return new_
                }
              }
              const rows: { key: 'udic' | 'cndic' | 'thesaurus'; label: string }[] = [
                { key: 'udic', label: '사용자사전' },
                { key: 'cndic', label: '복합명사사전' },
                { key: 'thesaurus', label: '유사어사전' },
              ]
              const th = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
                padding: '6px 10px', border: '1px solid #f0f0f0', textAlign: align, fontWeight: 500,
              })
              const td = (align: 'left' | 'right' = 'right', extra?: React.CSSProperties): React.CSSProperties => ({
                padding: '6px 10px', border: '1px solid #f0f0f0', textAlign: align, ...(extra || {}),
              })
              const 총작업대상 = rows.filter(r => 임포트옵션[r.key]).reduce((sum, r) => sum + 작업대상(r.key), 0)
              return (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={th('left')}>사전</th>
                        <th style={th()}>현재 DB</th>
                        <th style={th()}>파일</th>
                        <th style={th()}>작업대상</th>
                        <th style={th()}>변경후(예상)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ key, label }) => {
                        const 선택 = 임포트옵션[key]
                        const target = 작업대상(key)
                        const after = 변경후(key, 선택)
                        const diffCnt = after - DB[key]
                        return (
                          <tr key={key}>
                            <td style={td('left')}>
                              <Checkbox checked={선택} disabled={파일[key] === 0} onChange={e => set임포트옵션({ ...임포트옵션, [key]: e.target.checked })}>{label}</Checkbox>
                            </td>
                            <td style={td('right', { color: '#888' })}>{DB[key].toLocaleString()}</td>
                            <td style={td('right')}>{파일[key].toLocaleString()}</td>
                            <td style={td('right', { color: target > 0 ? '#1677ff' : '#bbb' })}>{target.toLocaleString()}</td>
                            <td style={td('right')}>
                              {선택 ? (
                                <span>
                                  {after.toLocaleString()}
                                  {diffCnt !== 0 && <span style={{ marginLeft: 6, fontSize: 11, color: diffCnt > 0 ? '#52c41a' : '#ff4d4f' }}>({diffCnt > 0 ? '+' : ''}{diffCnt.toLocaleString()})</span>}
                                </span>
                              ) : <span style={{ color: '#bbb' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                      <tr style={{ background: '#fafafa', fontWeight: 500 }}>
                        <td style={td('left')}>합계</td>
                        <td style={td('right', { color: '#888' })}>{(DB.udic + DB.cndic + DB.thesaurus).toLocaleString()}</td>
                        <td style={td('right')}>{(파일.udic + 파일.cndic + 파일.thesaurus).toLocaleString()}</td>
                        <td style={td('right', { color: 총작업대상 > 0 ? '#1677ff' : '#bbb' })}>{총작업대상.toLocaleString()}</td>
                        <td style={td('right')}>
                          {(변경후('udic', 임포트옵션.udic) + 변경후('cndic', 임포트옵션.cndic) + 변경후('thesaurus', 임포트옵션.thesaurus)).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {임포트모드 === 'append' && 총작업대상 === 0 && (
                    <Alert style={{ marginTop: 12 }} type="info" showIcon message="추가할 신규 항목이 없습니다." />
                  )}
                </>
              )
            })()}
          </div>
        )}
        {!임포트중 && !파일건수 && <div style={{ textAlign: 'center', padding: 24 }}><Text type="secondary">파일 건수 조회 중...</Text></div>}
        {임포트중 && 진행률 && (
          <div>
            <Text>현재 단계: {단계라벨(진행률.stage)}</Text>
            <Progress percent={진행률.percent} status={진행률.status === 'error' ? 'exception' : 'active'} style={{ marginTop: 12 }} />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>처리 건수: {진행률.current?.toLocaleString() || 0} 건</Text>
          </div>
        )}
      </Modal>


    </div>
  )
}
