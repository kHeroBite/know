import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Table, Input, Button, Modal, Form, Popconfirm, message, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, ImportOutlined } from '@ant-design/icons'
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
  const [검색어, set검색어] = useState('')
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [form] = Form.useForm()
  const cfg = 사전설정[dicType]

  const 데이터조회 = useCallback(async () => {
    if (!선택도메인) return
    set로딩(true)
    try {
      const 경로 = dicType === 'thesaurus' ? 'thesaurus/list' : dicType
      const res = await 클라이언트.get(`/dictionaries/${선택도메인}/${경로}`)
      set데이터(res.data?.items || [])
    } catch {
      message.error(`${cfg.title} 조회 실패`)
    } finally {
      set로딩(false)
    }
  }, [선택도메인, dicType])

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

  const 필터데이터 = 데이터.filter(item => {
    if (!검색어) return true
    const target = dicType === 'thesaurus'
      ? `${item.head_word} ${item.tail_word}`
      : `${item.word} ${item.memo || ''}`
    return target.includes(검색어)
  })

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
      <Input.Search
        placeholder="검색..."
        onSearch={v => set검색어(v)}
        onChange={e => { if (!e.target.value) set검색어('') }}
        allowClear
        size="small"
        style={{ marginBottom: 8 }}
      />
      <Table
        dataSource={필터데이터}
        columns={columns}
        rowKey={dicType === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
        loading={로딩}
        size="small"
        scroll={{ y: 500 }}
        pagination={{ size: 'small', pageSize: 20, showSizeChanger: false, showTotal: t => `${t}건` }}
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
  const [임포트중, set임포트중] = useState(false)
  const [key, setKey] = useState(0)

  const 파일임포트 = async () => {
    if (!선택도메인) return
    set임포트중(true)
    try {
      const res = await 클라이언트.post(`/dictionaries/${선택도메인}/import-from-files`)
      message.success(res.data?.message || '임포트 완료')
      setKey(k => k + 1)
    } catch (err: any) {
      message.error('임포트 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally {
      set임포트중(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>사전 관리</Typography.Title>
        <Popconfirm
          title="파일에서 가져오기"
          description="DB를 초기화하고 파일 사전으로 다시 등록합니다. 계속하시겠습니까?"
          onConfirm={파일임포트}
          okText="실행"
          cancelText="취소"
          okButtonProps={{ danger: true }}
        >
          <Button icon={<ImportOutlined />} loading={임포트중} disabled={!선택도메인}>
            파일에서 가져오기
          </Button>
        </Popconfirm>
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
    </div>
  )
}
