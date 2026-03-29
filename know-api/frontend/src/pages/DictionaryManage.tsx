import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Table, Input, Button, Modal, Form, Popconfirm, message, Typography, Descriptions, Progress, Alert, Checkbox } from 'antd'
import { PlusOutlined, DeleteOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons'
import 클라이언트 from '../api/client'
import { useWorkspaceStore } from '../stores/workspaceStore'

type DicType = 'udic' | 'cndic' | 'thesaurus'

const 사전설정: Record<DicType, { title: string; label: string }> = {
  udic: { title: '사용자사전', label: '사용자사전(udic)' },
  cndic: { title: '복합명사사전', label: '복합명사사전(cndic)' },
  thesaurus: { title: '유의어사전', label: '유의어사전(thesaurus)' },
}

function 사전컬럼(dicType: DicType) {
  return (삭제버튼: (r: any) => React.ReactNode) => {
    if (dicType === 'thesaurus') {
      return [
        { title: '기준 단어', dataIndex: 'head_word', key: 'head_word', ellipsis: true },
        { title: '유의어', dataIndex: 'tail_word', key: 'tail_word', ellipsis: true },
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
  const [검색어, set검색어] = useState('')        // 입력값 (즉시 반영)
  const [검색쿼리, set검색쿼리] = useState('')    // API 호출용 (debounce 후)
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

  // debounce: 검색어 변경 후 100ms 뒤에 검색쿼리 업데이트 → 데이터조회 트리거
  useEffect(() => {
    const timer = setTimeout(() => {
      set검색쿼리(검색어)
      set현재페이지(1)
    }, 100)
    return () => clearTimeout(timer)
  }, [검색어])

  useEffect(() => {
    if (선택도메인) 데이터조회()
  }, [선택도메인, 데이터조회])

  const 삭제 = async (record: any) => {
    try {
      const word = dicType === 'thesaurus' ? record.head_word : record.word
      await 클라이언트.delete(`/dictionaries/${선택도메인}/${dicType}/${encodeURIComponent(word)}`)
      message.success('삭제 완료')
      데이터조회()
    } catch {
      message.error('삭제 실패')
    }
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
    } finally {
      set저장중(false)
    }
  }

  const 삭제버튼 = (record: any) => (
    <Popconfirm title="삭제?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
      <Button size="small" icon={<DeleteOutlined />} danger type="text" />
    </Popconfirm>
  )

  const columns = 사전컬럼(dicType)(삭제버튼)

  const 모달폼내용 = () => {
    if (dicType === 'thesaurus') {
      return (
        <>
          <Form.Item name="head_word" label="기준 단어" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tail_word" label="유의어" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </>
      )
    }
    return (
      <>
        <Form.Item name="word" label="단어" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="memo" label="메모">
          <Input />
        </Form.Item>
      </>
    )
  }

  return (
    <Card
      title={cfg.title}
      size="small"
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); set모달열림(true) }}>
          추가
        </Button>
      }
    >
      <Input
        placeholder="검색..."
        value={검색어}
        onChange={e => set검색어(e.target.value)}
        allowClear
        size="small"
        prefix={<SearchOutlined />}
        style={{ marginBottom: 8 }}
      />
      <Table
        dataSource={데이터}
        columns={columns}
        rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
        loading={로딩}
        size="small"
        scroll={{ y: 500 }}
        pagination={{
          current: 현재페이지,
          pageSize: 50,
          total: 총건수,
          showTotal: (total) => `총 ${total.toLocaleString()}건`,
          showSizeChanger: false,
          size: 'small',
          onChange: (page) => { set현재페이지(page) },
        }}
      />
      <Modal
        title={`${cfg.label} 추가`}
        open={모달열림}
        onOk={저장}
        onCancel={() => set모달열림(false)}
        confirmLoading={저장중}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical">
          {모달폼내용()}
        </Form>
      </Modal>
    </Card>
  )
}

export default function DictionaryManage() {
  const { selectedDomain: 선택도메인 } = useWorkspaceStore()
  const [임포트모달, set임포트모달] = useState(false)
  const [파일건수, set파일건수] = useState<{udic: number; cndic: number; thesaurus: number} | null>(null)
  const [임포트중, set임포트중] = useState(false)
  const [진행률, set진행률] = useState<{percent: number; stage: string; status: string; current: number} | null>(null)
  const [key, setKey] = useState(0)
  const [임포트옵션, set임포트옵션] = useState({udic: true, cndic: true, thesaurus: true})

  const 임포트모달열기 = async () => {
    set임포트모달(true)
    set파일건수(null)
    set진행률(null)
    set임포트옵션({udic: true, cndic: true, thesaurus: true})
    try {
      const res = await 클라이언트.get(`/dictionaries/${선택도메인}/file-preview`)
      set파일건수(res.data)
    } catch {
      set파일건수(null)
    }
  }

  const 임포트실행 = async () => {
    set임포트중(true)
    set진행률({ percent: 0, stage: 'preparing', status: 'running', current: 0 })
    try {
      await 클라이언트.post(`/dictionaries/${선택도메인}/import-from-files?udic=${임포트옵션.udic}&cndic=${임포트옵션.cndic}&thesaurus=${임포트옵션.thesaurus}`)
      const poll = setInterval(async () => {
        try {
          const res = await 클라이언트.get(`/dictionaries/${선택도메인}/import-progress`)
          set진행률(res.data)
          if (res.data.status === 'done' || res.data.status === 'error') {
            clearInterval(poll)
            set임포트중(false)
            if (res.data.status === 'done') {
              const r = res.data.result
              message.success(`임포트 완료: 사용자사전 ${r.udic}건, 복합명사 ${r.cndic}건, 유의어 ${r.thesaurus}건`)
              setKey(k => k + 1)
              setTimeout(() => set임포트모달(false), 1500)
            }
            if (res.data.status === 'error') {
              message.error('임포트 실패: ' + (res.data.result?.error || '알 수 없는 오류'))
            }
          }
        } catch { /* polling error 무시 */ }
      }, 1000)
    } catch (e: any) {
      set임포트중(false)
      message.error(e?.response?.data?.detail || '임포트 시작 실패')
    }
  }

  const 단계라벨 = (stage: string) => {
    switch (stage) {
      case 'udic': return '사용자사전'
      case 'cndic': return '복합명사사전'
      case 'thesaurus': return '유의어사전'
      default: return '준비 중'
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>사전 관리</Typography.Title>
        <Button icon={<ImportOutlined />} onClick={임포트모달열기} disabled={!선택도메인}>
          파일에서 가져오기
        </Button>
      </div>

      <Row gutter={16} key={key}>
        <Col span={8}>
          <DicColumn dicType="udic" 선택도메인={선택도메인 || ''} />
        </Col>
        <Col span={8}>
          <DicColumn dicType="cndic" 선택도메인={선택도메인 || ''} />
        </Col>
        <Col span={8}>
          <DicColumn dicType="thesaurus" 선택도메인={선택도메인 || ''} />
        </Col>
      </Row>

      <Modal
        title="파일에서 사전 가져오기"
        open={임포트모달}
        onCancel={() => !임포트중 && set임포트모달(false)}
        footer={임포트중 ? null : [
          <Button key="cancel" onClick={() => set임포트모달(false)}>취소</Button>,
          <Button key="ok" type="primary" danger onClick={임포트실행} disabled={!파일건수 || (!임포트옵션.udic && !임포트옵션.cndic && !임포트옵션.thesaurus)}>선택 사전 가져오기</Button>,
        ]}
        width={600}
        closable={!임포트중}
        maskClosable={false}
      >
        {!임포트중 && 파일건수 && (
          <div>
            <Alert message="선택한 사전의 기존 DB 데이터를 삭제하고 파일에서 다시 등록합니다." type="warning" showIcon style={{ marginBottom: 16 }} />
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={
                <Checkbox checked={임포트옵션.udic} disabled={파일건수.udic === 0} onChange={e => set임포트옵션({...임포트옵션, udic: e.target.checked})}>
                  사용자사전
                </Checkbox>
              }>{파일건수.udic.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label={
                <Checkbox checked={임포트옵션.cndic} disabled={파일건수.cndic === 0} onChange={e => set임포트옵션({...임포트옵션, cndic: e.target.checked})}>
                  복합명사사전
                </Checkbox>
              }>{파일건수.cndic.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label={
                <Checkbox checked={임포트옵션.thesaurus} disabled={파일건수.thesaurus === 0} onChange={e => set임포트옵션({...임포트옵션, thesaurus: e.target.checked})}>
                  유의어사전
                </Checkbox>
              }>{파일건수.thesaurus.toLocaleString()} 건</Descriptions.Item>
              <Descriptions.Item label="합계">
                {((임포트옵션.udic ? 파일건수.udic : 0) + (임포트옵션.cndic ? 파일건수.cndic : 0) + (임포트옵션.thesaurus ? 파일건수.thesaurus : 0)).toLocaleString()} 건 (선택) / {(파일건수.udic + 파일건수.cndic + 파일건수.thesaurus).toLocaleString()} 건 (전체)
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
        {!임포트중 && !파일건수 && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Typography.Text type="secondary">파일 건수 조회 중...</Typography.Text>
          </div>
        )}
        {임포트중 && 진행률 && (
          <div>
            <Typography.Text>현재 단계: {단계라벨(진행률.stage)}</Typography.Text>
            <Progress percent={진행률.percent} status={진행률.status === 'error' ? 'exception' : 'active'} style={{ marginTop: 12 }} />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              처리 건수: {진행률.current?.toLocaleString() || 0} 건
            </Typography.Text>
          </div>
        )}
      </Modal>
    </div>
  )
}
