import { useState, useEffect, useRef, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import {
  Typography, Button, Input, Select, Space, Popconfirm, message,
  Card, Row, Col, Progress, Modal, Form, Table, Radio,
  Descriptions, Alert, Checkbox, Divider,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, FolderOutlined,
  ImportOutlined, SearchOutlined, BookOutlined,
} from '@ant-design/icons'
import { workspaceAPI } from '../api/workspace'
import 클라이언트 from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'

const { Title, Text } = Typography

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
  const { isBlocked, startTask, finishTask, startPolling, currentTask } = useGlobalTaskStore()

  // 도메인 목록
  const [도메인목록, set도메인목록] = useState<{id: string, name: string | null}[]>([])
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
  const [도메인복사진행중, set도메인복사진행중] = useState<Record<string, number>>(() => {
    // 페이지 복귀 시 store에서 즉시 초기값 설정 (0% 깜빡임 방지)
    const task = useGlobalTaskStore.getState().currentTask
    if (!task || task.status !== 'running') return {}
    const match = task.id.match(/^domain-add-(.+?)-(?:\d+|restore)$/)
    if (!match) return {}
    return { [match[1]]: task.percent }
  })
  const 도메인폴링ref = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const [사전복사모드, set사전복사모드] = useState<'none' | 'sqlite' | 'mysql'>('none')
  const [사전복사소스, set사전복사소스] = useState<string | null>(null)
  const [mysql소스목록, setMysql소스목록] = useState<string[]>([])

  // 이름 변경
  const [이름변경대상, set이름변경대상] = useState<string | null>(null)
  const [변경후이름, set변경후이름] = useState('')

  // 사전관리 선택
  const [사전도메인, set사전도메인] = useState<string | null>(null)
  const [dicKey, setDicKey] = useState(0)

  // 임포트
  const [임포트모달, set임포트모달] = useState(false)
  const [파일건수, set파일건수] = useState<{udic: number; cndic: number; thesaurus: number} | null>(null)
  const [임포트중, set임포트중] = useState(false)
  const [진행률, set진행률] = useState<{percent: number; stage: string; status: string; current: number} | null>(null)
  const [임포트옵션, set임포트옵션] = useState({udic: true, cndic: true, thesaurus: true})
  const [임포트모드, set임포트모드] = useState<'create' | 'overwrite' | 'append'>('create')

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [dmRes, wsRes] = await Promise.all([
        workspaceAPI.도메인목록(),
        workspaceAPI.워크스페이스목록(),
      ])
      set도메인목록(dmRes.data)
      set워크스페이스목록(wsRes.data)
      // 진행 중인 도메인 폴링 복원 (페이지 로드/새로고침 시)
      const storeState = useGlobalTaskStore.getState()
      const storeTimers = storeState._timers
      const storeTask = storeState.currentTask
      for (const dm of dmRes.data) {
        const existingTaskId = Object.keys(storeTimers).find(tid => tid.startsWith(`domain-add-${dm.id}`))
        if (existingTaskId) continue // 이미 store에서 폴링 중 (페이지 이동 후 복귀)
        // store currentTask가 이 도메인 관련이고 running이면 스킵
        if (storeTask?.status === 'running' && storeTask.id.includes(dm.id)) continue
        try {
          const res = await workspaceAPI.도메인추가진행률(dm.id)
          if (res.data?.status && res.data.status !== 'idle' && res.data.status !== 'done') {
            const pct = res.data?.percent ?? 0
            set도메인복사진행중(prev => ({ ...prev, [dm.id]: pct }))
            const taskId = `domain-add-${dm.id}-${Date.now()}`
            startTask({ id: taskId, type: '도메인 추가', label: `${dm.id} 추가 중`, percent: pct })
            도메인폴링시작(dm.id, taskId)
          }
        } catch { /* ignore */ }
      }
    } catch {
      message.error('목록 조회 실패')
    } finally { set로딩(false) }
  }

  useEffect(() => { 목록조회() }, [])

  // store ↔ 로컬 도메인복사진행중 동기화 (페이지 이동 후 복귀 시 + 완료 시)
  useEffect(() => {
    if (!currentTask) return
    const match = currentTask.id.match(/^domain-add-(.+?)-(?:\d+|restore)$/)
    if (!match) return
    const dmName = match[1]
    if (currentTask.status === 'done' || currentTask.status === 'error') {
      // 완료/에러 시 로컬 state에서 제거 (99% 멈춤 방지)
      set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
    } else if (currentTask.status === 'running') {
      set도메인복사진행중(prev => ({ ...prev, [dmName]: currentTask.percent }))
    }
  }, [currentTask?.status, currentTask?.percent, currentTask?.id])

  const 도메인폴링시작 = (dmName: string, taskId: string) => {
    // store 폴링: 페이지 이동과 무관하게 유지됨
    startPolling(
      taskId,
      async () => {
        const res = await workspaceAPI.도메인추가진행률(dmName)
        const st = res.data?.status
        if (!st || st === 'idle') {
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          return { percent: 100, done: true, error: false }
        }
        if (st === 'dict_copying') {
          set도메인복사진행중(prev => ({ ...prev, [dmName]: 92 }))
          return { percent: 92, done: false, error: false }
        }
        if (st === 'done') {
          const elapsed = res.data?.elapsed
          const fc = res.data?.file_count
          const dictResult = res.data?.dict_result
          const dictMsg = dictResult ? ` + 사전 ${Object.values(dictResult).filter(v => typeof v === 'number').reduce((a: number, b) => a + (b as number), 0)}건` : ''
          message.success(`도메인 "${dmName}" 추가 완료 — ${fc ?? 0}개 파일${dictMsg}, ${elapsed}초`)
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          return { percent: 100, done: true, error: false }
        }
        if (st === 'error') {
          message.error(`도메인 추가 실패: ${res.data?.message}`)
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          return { percent: 0, done: false, error: true, message: res.data?.message }
        }
        const pct = res.data?.percent ?? 0
        set도메인복사진행중(prev => ({ ...prev, [dmName]: pct }))
        return { percent: pct, done: false, error: false }
      },
      1500,
      () => { 목록조회(); delete 도메인폴링ref.current[dmName] },
      () => { 목록조회(); delete 도메인폴링ref.current[dmName] },
    )
  }

  // 임포트
  const 임포트모달열기 = async () => {
    if (!사전도메인) return
    set임포트모달(true); set파일건수(null); set진행률(null)
    set임포트옵션({udic: true, cndic: true, thesaurus: true}); set임포트모드('create')
    try { const res = await 클라이언트.get(`/dictionaries/${사전도메인}/file-preview`); set파일건수(res.data) } catch { set파일건수(null) }
  }

  const 임포트실행 = async () => {
    if (!사전도메인) return
    set임포트중(true); set진행률({ percent: 0, stage: 'preparing', status: 'running', current: 0 })
    try {
      await 클라이언트.post(`/dictionaries/${사전도메인}/import-from-files?udic=${임포트옵션.udic}&cndic=${임포트옵션.cndic}&thesaurus=${임포트옵션.thesaurus}&mode=${임포트모드}`)
      const poll = setInterval(async () => {
        try {
          const res = await 클라이언트.get(`/dictionaries/${사전도메인}/import-progress`)
          set진행률(res.data)
          if (res.data.status === 'done' || res.data.status === 'error') {
            clearInterval(poll); set임포트중(false)
            if (res.data.status === 'done') {
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
            if (res.data.status === 'error') message.error('임포트 실패: ' + (res.data.result?.error || '알 수 없는 오류'))
          }
        } catch { /* polling error */ }
      }, 1000)
    } catch (e: any) { set임포트중(false); message.error(e?.response?.data?.detail || '임포트 시작 실패') }
  }

  const 단계라벨 = (stage: string) => {
    switch (stage) { case 'udic': return '사용자사전'; case 'cndic': return '복합명사사전'; case 'thesaurus': return '유사어사전'; default: return '준비 중' }
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
          <div key={dm} style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12, marginRight: 8 }}>{dm} 생성 중</Text>
            <Progress percent={pct} size="small" status="active" style={{ maxWidth: 300, display: 'inline-block' }} />
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                  <Space size={8}>
                    <Button icon={<BookOutlined />} type={선택됨 ? 'primary' : 'default'}
                      disabled={isBlocked}
                      onClick={() => { set사전도메인(선택됨 ? null : dm.id); setDicKey(k => k + 1) }}
                    >사전 관리</Button>
                    {isSuper && <>
                      <Button icon={<EditOutlined />} disabled={연결됨}
                        onClick={() => { set이름변경대상(dm.id); set변경후이름(dm.id) }}>이름 변경</Button>
                      <Popconfirm title={`도메인 "${dm.id}"을 삭제하시겠습니까?`} onConfirm={async () => {
                        const taskId = `domain-del-${dm.id}-${Date.now()}`
                        startTask({ id: taskId, type: '도메인 삭제', label: `${dm.id} 삭제 중`, percent: 50 })
                        try { await workspaceAPI.도메인삭제(dm.id); message.success(`도메인 "${dm.id}" 삭제 완료`); if (사전도메인 === dm.id) set사전도메인(null); finishTask(taskId, 'done'); await 목록조회() }
                        catch (err: any) { message.error(err.response?.data?.detail || '삭제 실패'); finishTask(taskId, 'error') }
                      }} okText="삭제" cancelText="취소">
                        <Button danger icon={<DeleteOutlined />} disabled={연결됨 || Object.keys(도메인복사진행중).length > 0 || isBlocked}>삭제</Button>
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

      {/* ─── 이름 변경 모달 ─── */}
      <Modal title={`도메인 이름 변경 — ${이름변경대상}`} open={!!이름변경대상}
        onOk={async () => {
          if (!이름변경대상 || !변경후이름.trim()) return
          try { await workspaceAPI.도메인이름변경(이름변경대상, 변경후이름.trim()); message.success('이름 변경 완료'); set이름변경대상(null); set변경후이름(''); await 목록조회() }
          catch (err: any) { message.error(err.response?.data?.detail || '이름 변경 실패') }
        }}
        onCancel={() => { set이름변경대상(null); set변경후이름('') }} okText="변경" cancelText="취소" okButtonProps={{ disabled: !변경후이름.trim() }}>
        <Input placeholder="새 도메인 이름" value={변경후이름} onChange={e => set변경후이름(e.target.value)} style={{ marginTop: 8 }} />
      </Modal>

      {/* ─── 도메인 추가 모달 ─── */}
      <Modal title="도메인 추가" open={도메인추가팝업}
        onOk={async () => {
          if (!도메인신규이름.trim() || !도메인소스이름) { message.warning('이름과 소스를 모두 입력하세요'); return }
          set도메인추가로딩(true)
          const dmName = 도메인신규이름.trim()
          try {
            const copyDictFrom = 사전복사모드 === 'sqlite' ? 사전복사소스 : null
            const mysqlDictFrom = 사전복사모드 === 'mysql' ? 사전복사소스 : null
            await workspaceAPI.도메인추가(dmName, 도메인소스타입, 도메인소스이름, copyDictFrom, mysqlDictFrom, 도메인표시이름.trim() || undefined)
            message.info(`도메인 "${dmName}" 복사 시작${사전복사모드 !== 'none' ? ' (사전 포함)' : ''}`)
            set도메인추가팝업(false); set도메인신규이름(''); set도메인표시이름(''); set도메인소스이름(null); set사전복사모드('none'); set사전복사소스(null)
            set도메인복사진행중(prev => ({ ...prev, [dmName]: 0 }))
            const taskId = `domain-add-${dmName}-${Date.now()}`
            startTask({ id: taskId, type: '도메인 추가', label: `${dmName} 추가 중`, percent: 0 })
            도메인폴링시작(dmName, taskId)
          } catch (err: any) { message.error(err.response?.data?.detail || '추가 실패') }
          finally { set도메인추가로딩(false) }
        }}
        onCancel={() => { set도메인추가팝업(false); set도메인신규이름(''); set도메인표시이름(''); set도메인소스이름(null); set사전복사모드('none'); set사전복사소스(null) }}
        okText="추가" cancelText="취소" confirmLoading={도메인추가로딩} okButtonProps={{ disabled: !도메인신규이름.trim() || !도메인소스이름 }}>
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <Input placeholder="도메인이름 (한글 가능, 선택사항)" value={도메인표시이름} onChange={e => set도메인표시이름(e.target.value)} />
          <Input placeholder="도메인 ID (영문, 필수)" value={도메인신규이름} onChange={e => set도메인신규이름(e.target.value)} />
          <Select style={{ width: '100%' }} value={도메인소스타입} onChange={v => {
            set도메인소스타입(v)
            set도메인소스이름(null)
            set사전복사소스(null)
            if (v === 'domain') {
              set사전복사모드('sqlite')
            } else {
              set사전복사모드('mysql')
            }
          }}
            options={[{ label: '현재 도메인에서 복사', value: 'domain' }, { label: '이전 도메인에서 복사', value: 'old' }]} />
          <Select style={{ width: '100%' }} placeholder="소스 선택"
            options={도메인소스타입 === 'old' ? (() => {
              const 사전있음 = (old소스목록 || []).filter(d => mysql소스목록.includes(d))
              const 사전없음 = (old소스목록 || []).filter(d => !mysql소스목록.includes(d))
              return [
                ...사전있음.map(d => ({ label: d, value: d })),
                ...사전없음.map(d => ({ label: <span style={{ color: '#bbb' }}>{d}</span>, value: d })),
              ]
            })() : 도메인목록.map(d => ({ label: d.name ? `${d.name} (${d.id})` : d.id, value: d.id }))}
            onChange={v => {
              set도메인소스이름(v)
              set도메인신규이름(v)
              // 소스 선택 시 사전 DB 자동 선택 — 콤보박스 목록에 있을 때만
              if (도메인소스타입 === 'domain') {
                const 존재 = 도메인목록.some(d => d.id === v)
                set사전복사소스(존재 ? v : null)
                set사전복사모드('sqlite')
              } else {
                const 존재 = mysql소스목록.includes(v)
                set사전복사소스(존재 ? v : null)
                set사전복사모드('mysql')
              }
            }} value={도메인소스이름} />
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>사전 복사 옵션</Text>
            <Radio.Group value={사전복사모드} onChange={e => {
              const newMode = e.target.value
              set사전복사모드(newMode)
              // 모드 변경 시 자동선택 — 콤보박스 목록에 있을 때만
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
            <Select style={{ width: '100%' }} placeholder="사전 복사할 기존 도메인 선택"
              options={도메인목록.map(d => ({ label: d.name ? `${d.name} (${d.id})` : d.id, value: d.id }))} onChange={v => set사전복사소스(v)} value={사전복사소스} />
          )}
          {사전복사모드 === 'mysql' && (
            <Select style={{ width: '100%' }} placeholder="MySQL 도메인 선택" showSearch
              options={mysql소스목록.map(d => ({ label: d, value: d }))} onChange={v => set사전복사소스(v)} value={사전복사소스} />
          )}
        </Space>
      </Modal>

      {/* ─── 사전 임포트 모달 ─── */}
      <Modal title="파일에서 사전 가져오기" open={임포트모달}
        onCancel={() => !임포트중 && set임포트모달(false)} width={600} closable={!임포트중} maskClosable={false}
        footer={임포트중 ? null : [
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
            {임포트모드 === 'create' && <Alert message="선택한 사전의 기존 DB 데이터를 삭제하고 파일에서 다시 등록합니다." type="warning" showIcon style={{ marginBottom: 16 }} />}
            {임포트모드 === 'overwrite' && <Alert message="기존 데이터를 유지하면서 파일의 동일 키워드를 업데이트합니다." type="info" showIcon style={{ marginBottom: 16 }} />}
            {임포트모드 === 'append' && <Alert message="기존 데이터를 유지하면서 새로운 키워드만 추가합니다." type="info" showIcon style={{ marginBottom: 16 }} />}
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={<Checkbox checked={임포트옵션.udic} disabled={파일건수.udic === 0} onChange={e => set임포트옵션({...임포트옵션, udic: e.target.checked})}>사용자사전</Checkbox>}>{파일건수.udic.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label={<Checkbox checked={임포트옵션.cndic} disabled={파일건수.cndic === 0} onChange={e => set임포트옵션({...임포트옵션, cndic: e.target.checked})}>복합명사사전</Checkbox>}>{파일건수.cndic.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label={<Checkbox checked={임포트옵션.thesaurus} disabled={파일건수.thesaurus === 0} onChange={e => set임포트옵션({...임포트옵션, thesaurus: e.target.checked})}>유사어사전</Checkbox>}>{파일건수.thesaurus.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label="합계">
                {((임포트옵션.udic ? 파일건수.udic : 0) + (임포트옵션.cndic ? 파일건수.cndic : 0) + (임포트옵션.thesaurus ? 파일건수.thesaurus : 0)).toLocaleString()} 건 (선택) / {(파일건수.udic + 파일건수.cndic + 파일건수.thesaurus).toLocaleString()} 건 (전체)
              </Descriptions.Item>
            </Descriptions>
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
