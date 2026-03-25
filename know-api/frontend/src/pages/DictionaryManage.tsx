import { useState, useEffect } from 'react'
import { Select, Tabs, Table, Input, Button, Modal, Form, Popconfirm, message, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import 클라이언트 from '../api/client'

interface Domain { site: string; memo: string }
interface DicEntry { word: string; memo?: string }
interface ThesaurusEntry { head_word: string; tail_word: string }

type TabKey = 'udic' | 'cndic' | 'thesaurus'

export default function DictionaryManage() {
  const [도메인목록, set도메인목록] = useState<Domain[]>([])
  const [선택도메인, set선택도메인] = useState<string>('')
  const [활성탭, set활성탭] = useState<TabKey>('udic')
  const [데이터, set데이터] = useState<any[]>([])
  const [검색어, set검색어] = useState('')
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    클라이언트.get('/domains').then(res => {
      set도메인목록(res.data)
      if (res.data.length > 0) set선택도메인(res.data[0].site)
    }).catch(() => message.error('도메인 목록 조회 실패'))
  }, [])

  useEffect(() => {
    if (선택도메인) 데이터조회()
  }, [선택도메인, 활성탭])

  const 데이터조회 = async () => {
    if (!선택도메인) return
    set로딩(true)
    try {
      const res = await 클라이언트.get(`/dictionaries/${선택도메인}/${활성탭}`)
      set데이터(res.data)
    } catch {
      message.error('데이터 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  const 삭제 = async (record: any) => {
    try {
      const word = 활성탭 === 'thesaurus' ? record.head_word : record.word
      await 클라이언트.delete(`/dictionaries/${선택도메인}/${활성탭}/${encodeURIComponent(word)}`)
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
      await 클라이언트.post(`/dictionaries/${선택도메인}/${활성탭}`, values)
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
    const target = 활성탭 === 'thesaurus'
      ? `${item.head_word} ${item.tail_word}`
      : `${item.word} ${item.memo || ''}`
    return target.includes(검색어)
  })

  const 삭제버튼 = (record: any) => (
    <Popconfirm title="삭제하시겠습니까?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
      <Button size="small" icon={<DeleteOutlined />} danger />
    </Popconfirm>
  )

  const udic컬럼 = [
    { title: '단어', dataIndex: 'word', key: 'word' },
    { title: '메모', dataIndex: 'memo', key: 'memo' },
    { title: '작업', key: 'action', width: 80, render: (_: unknown, r: any) => 삭제버튼(r) },
  ]

  const cndic컬럼 = [
    { title: '복합어', dataIndex: 'word', key: 'word' },
    { title: '메모', dataIndex: 'memo', key: 'memo' },
    { title: '작업', key: 'action', width: 80, render: (_: unknown, r: any) => 삭제버튼(r) },
  ]

  const thesaurus컬럼 = [
    { title: '기준 단어', dataIndex: 'head_word', key: 'head_word' },
    { title: '유의어', dataIndex: 'tail_word', key: 'tail_word' },
    { title: '작업', key: 'action', width: 80, render: (_: unknown, r: any) => 삭제버튼(r) },
  ]

  const 탭컬럼: Record<TabKey, any[]> = { udic: udic컬럼, cndic: cndic컬럼, thesaurus: thesaurus컬럼 }

  const 모달폼내용 = () => {
    if (활성탭 === 'thesaurus') {
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

  const tabLabel: Record<TabKey, string> = { udic: '사용자 사전(udic)', cndic: '복합어 사전(cndic)', thesaurus: '유의어(thesaurus)' }

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>사전 관리</Typography.Title>

      <Space style={{ marginBottom: 16 }}>
        <span>도메인:</span>
        <Select
          value={선택도메인}
          onChange={set선택도메인}
          style={{ width: 180 }}
          options={도메인목록.map(d => ({ value: d.site, label: d.site }))}
        />
      </Space>

      <Tabs
        activeKey={활성탭}
        onChange={key => { set활성탭(key as TabKey); set검색어('') }}
        items={(['udic', 'cndic', 'thesaurus'] as TabKey[]).map(tab => ({
          key: tab,
          label: tabLabel[tab],
          children: (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="검색..."
                  value={검색어}
                  onChange={e => set검색어(e.target.value)}
                  style={{ width: 240 }}
                  allowClear
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); set모달열림(true) }}>
                  추가
                </Button>
              </div>
              <Table
                dataSource={필터데이터}
                columns={탭컬럼[tab]}
                rowKey={tab === 'thesaurus' ? (r: any) => `${r.head_word}-${r.tail_word}` : 'word'}
                loading={로딩}
                pagination={{ pageSize: 20 }}
                size="small"
              />
            </div>
          ),
        }))}
      />

      <Modal
        title={`${tabLabel[활성탭]} 추가`}
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
    </div>
  )
}
