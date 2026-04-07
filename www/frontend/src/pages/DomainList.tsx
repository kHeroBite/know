import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Popconfirm, message, Space, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import 클라이언트 from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface Domain {
  site: string
  memo: string
  ip: string
  port: number
  url: string
  param: string
}

export default function DomainList() {
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.auth === 'A'

  const [목록, set목록] = useState<Domain[]>([])
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [수정대상, set수정대상] = useState<Domain | null>(null)
  const [저장중, set저장중] = useState(false)
  const [form] = Form.useForm()

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const res = await 클라이언트.get('/domains')
      set목록(res.data?.items || [])
    } catch {
      message.error('도메인 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => { 목록조회() }, [])

  const 추가모달열기 = () => {
    set수정대상(null)
    form.resetFields()
    set모달열림(true)
  }

  const 수정모달열기 = (record: Domain) => {
    set수정대상(record)
    form.setFieldsValue(record)
    set모달열림(true)
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      if (수정대상) {
        await 클라이언트.put(`/domains/${수정대상.site}`, values)
        message.success('도메인 수정 완료')
      } else {
        await 클라이언트.post('/domains', values)
        message.success('도메인 추가 완료')
      }
      set모달열림(false)
      목록조회()
    } catch (err: any) {
      if (err?.errorFields) return // form validation 오류
      message.error('저장 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally {
      set저장중(false)
    }
  }

  const 삭제 = async (site: string) => {
    try {
      await 클라이언트.delete(`/domains/${site}`)
      message.success('도메인 삭제 완료')
      목록조회()
    } catch {
      message.error('삭제 실패')
    }
  }

  const 컬럼 = [
    { title: 'Site', dataIndex: 'site', key: 'site', width: 120 },
    { title: '메모', dataIndex: 'memo', key: 'memo' },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140 },
    { title: 'Port', dataIndex: 'port', key: 'port', width: 80 },
    { title: 'URL', dataIndex: 'url', key: 'url' },
    {
      title: '작업',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Domain) =>
        isAdmin ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => 수정모달열기(record)} />
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => 삭제(record.site)} okText="삭제" cancelText="취소">
              <Button size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Space>
        ) : null,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>도메인 관리</Typography.Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={추가모달열기}>도메인 추가</Button>
        )}
      </div>

      <Table
        dataSource={목록}
        columns={컬럼}
        rowKey="site"
        loading={로딩}
        pagination={{ pageSize: 20 }}
        size="small"
      />

      <Modal
        title={수정대상 ? '도메인 수정' : '도메인 추가'}
        open={모달열림}
        onOk={저장}
        onCancel={() => set모달열림(false)}
        confirmLoading={저장중}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical">
          {!수정대상 && (
            <Form.Item name="site" label="Site" rules={[{ required: true, message: 'Site를 입력하세요.' }]}>
              <Input placeholder="예: news" />
            </Form.Item>
          )}
          <Form.Item name="memo" label="메모">
            <Input />
          </Form.Item>
          <Form.Item name="ip" label="IP">
            <Input placeholder="예: 192.168.1.1" />
          </Form.Item>
          <Form.Item name="port" label="Port">
            <Input type="number" placeholder="예: 8080" />
          </Form.Item>
          <Form.Item name="url" label="URL">
            <Input placeholder="예: http://..." />
          </Form.Item>
          <Form.Item name="param" label="파라미터">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
