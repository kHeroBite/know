import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, Popconfirm, Tag, message, Space, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons'
import { accountApi, Account } from '../api/account'

const AUTH_OPTIONS = [
  { value: 'A', label: '관리자' },
  { value: 'W', label: '편집자' },
  { value: 'R', label: '읽기전용' },
]

const AUTH_COLORS: Record<string, string> = { A: 'red', W: 'blue', R: 'default' }

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [form] = Form.useForm()

  const 목록조회 = async () => {
    setLoading(true)
    try {
      const res = await accountApi.목록()
      setAccounts(res.data)
    } catch (e: any) {
      message.error('계정 목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 목록조회() }, [])

  const 모달열기 = (account?: Account) => {
    if (account) {
      setEditTarget(account)
      form.setFieldsValue({ user_id: account.user_id, name: account.name, auth: account.auth, password: '' })
    } else {
      setEditTarget(null)
      form.resetFields()
      form.setFieldsValue({ auth: 'R' })
    }
    setModalOpen(true)
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      if (editTarget) {
        const data: any = {}
        if (values.name) data.name = values.name
        if (values.password) data.password = values.password
        if (values.auth) data.auth = values.auth
        await accountApi.수정(editTarget.user_id, data)
        message.success('계정 수정 완료')
      } else {
        await accountApi.생성(values)
        message.success('계정 생성 완료')
      }
      setModalOpen(false)
      목록조회()
    } catch (e: any) {
      if (e.response?.data?.detail) message.error(e.response.data.detail)
    }
  }

  const 삭제 = async (userId: string) => {
    try {
      await accountApi.삭제(userId)
      message.success('계정 삭제 완료')
      목록조회()
    } catch (e: any) {
      message.error(e.response?.data?.detail || '삭제 실패')
    }
  }

  const columns = [
    { title: '아이디', dataIndex: 'user_id', key: 'user_id', render: (v: string) => <><UserOutlined style={{ marginRight: 6 }} />{v}</> },
    { title: '이름', dataIndex: 'name', key: 'name' },
    { title: '권한', dataIndex: 'auth', key: 'auth', render: (v: string) => <Tag color={AUTH_COLORS[v]}>{AUTH_OPTIONS.find(o => o.value === v)?.label || v}</Tag> },
    { title: '생성일', dataIndex: 'created', key: 'created', render: (v: string) => v ? v.substring(0, 19) : '-' },
    {
      title: '작업', key: 'actions',
      render: (_: any, record: Account) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => 모달열기(record)}>수정</Button>
          {record.user_id !== 'admin' && (
            <Popconfirm title={`'${record.user_id}' 계정을 삭제하시겠습니까?`} onConfirm={() => 삭제(record.user_id)} okText="삭제" cancelText="취소">
              <Button size="small" danger icon={<DeleteOutlined />}>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>계정 관리</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => 모달열기()}>계정 추가</Button>
      </div>
      <Table dataSource={accounts} columns={columns} rowKey="user_id" loading={loading} pagination={false} />
      <Modal title={editTarget ? '계정 수정' : '계정 추가'} open={modalOpen} onOk={저장} onCancel={() => setModalOpen(false)} okText="저장" cancelText="취소">
        <Form form={form} layout="vertical">
          <Form.Item name="user_id" label="아이디" rules={[{ required: !editTarget, message: '아이디를 입력하세요' }]}>
            <Input disabled={!!editTarget} placeholder="영문/숫자" />
          </Form.Item>
          <Form.Item name="name" label="이름" rules={[{ required: !editTarget, message: '이름을 입력하세요' }]}>
            <Input placeholder="표시 이름" />
          </Form.Item>
          <Form.Item name="password" label={editTarget ? '비밀번호 (변경 시에만 입력)' : '비밀번호'} rules={editTarget ? [] : [{ required: true, message: '비밀번호를 입력하세요' }]}>
            <Input.Password placeholder="비밀번호" />
          </Form.Item>
          <Form.Item name="auth" label="권한">
            <Select options={AUTH_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
