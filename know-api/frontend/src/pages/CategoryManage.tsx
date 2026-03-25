import { useState, useEffect } from 'react'
import { Select, Table, Button, Modal, Form, Input, Popconfirm, message, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import 클라이언트 from '../api/client'

interface Domain { site: string; memo: string }
interface Category { word: string; display_category: string }

export default function CategoryManage() {
  const [도메인목록, set도메인목록] = useState<Domain[]>([])
  const [선택도메인, set선택도메인] = useState<string>('')
  const [목록, set목록] = useState<Category[]>([])
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    클라이언트.get('/domains').then(res => {
      set도메인목록(res.data?.items || [])
      if (res.data?.items?.length > 0) set선택도메인(res.data.items[0].site)
    }).catch(() => message.error('도메인 목록 조회 실패'))
  }, [])

  useEffect(() => {
    if (선택도메인) 목록조회()
  }, [선택도메인])

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const res = await 클라이언트.get(`/categories/${선택도메인}`)
      set목록(res.data?.items || [])
    } catch {
      message.error('카테고리 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  const 삭제 = async (record: Category) => {
    try {
      await 클라이언트.delete(
        `/categories/${선택도메인}/${encodeURIComponent(record.word)}`,
        { params: { display_category: record.display_category } }
      )
      message.success('삭제 완료')
      목록조회()
    } catch {
      message.error('삭제 실패')
    }
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      await 클라이언트.post(`/categories/${선택도메인}`, values)
      message.success('추가 완료')
      set모달열림(false)
      form.resetFields()
      목록조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('추가 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally {
      set저장중(false)
    }
  }

  const 컬럼 = [
    { title: '단어', dataIndex: 'word', key: 'word' },
    { title: '표시 카테고리', dataIndex: 'display_category', key: 'display_category' },
    {
      title: '작업',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Category) => (
        <Popconfirm title="삭제하시겠습니까?" onConfirm={() => 삭제(record)} okText="삭제" cancelText="취소">
          <Button size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>카테고리 관리</Typography.Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <span>도메인:</span>
          <Select
            value={선택도메인}
            onChange={val => set선택도메인(val)}
            style={{ width: 180 }}
            options={도메인목록.map(d => ({ value: d.site, label: d.site }))}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); set모달열림(true) }}>
          항목 추가
        </Button>
      </div>

      <Table
        dataSource={목록}
        columns={컬럼}
        rowKey={r => `${r.word}-${r.display_category}`}
        loading={로딩}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      <Modal
        title="카테고리 항목 추가"
        open={모달열림}
        onOk={저장}
        onCancel={() => set모달열림(false)}
        confirmLoading={저장중}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="word" label="단어" rules={[{ required: true, message: '단어를 입력하세요.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="display_category" label="표시 카테고리" rules={[{ required: true, message: '카테고리를 입력하세요.' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
