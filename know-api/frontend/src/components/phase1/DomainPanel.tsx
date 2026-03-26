import { useState, useEffect } from 'react'
import { Table, Button, Input, Space, Popconfirm, message, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { phase1API } from '../../api/phase1'

interface DomainItem {
  name: string
}

interface DomainPanelProps {
  currentUser: { user_id: string; auth: string } | null
}

export default function DomainPanel({ currentUser }: DomainPanelProps) {
  const [도메인목록, set도메인목록] = useState<DomainItem[]>([])
  const [로딩, set로딩] = useState(false)
  const [신규도메인, set신규도메인] = useState('')
  const [추가중, set추가중] = useState(false)

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const { data } = await phase1API.도메인목록()
      set도메인목록((data.domains || []).map((name: string) => ({ name })))
    } catch {
      message.error('도메인 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => { 목록조회() }, [])

  const 도메인추가 = async () => {
    const name = 신규도메인.trim()
    if (!name) return
    set추가중(true)
    try {
      await phase1API.도메인생성(name)
      message.success(`도메인 "${name}" 추가 완료`)
      set신규도메인('')
      목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 추가 실패')
    } finally {
      set추가중(false)
    }
  }

  const 도메인삭제 = async (name: string) => {
    try {
      await phase1API.도메인삭제(name)
      message.success(`도메인 "${name}" 삭제 완료`)
      목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 삭제 실패')
    }
  }

  const 도메인불러오기 = async (name: string) => {
    try {
      await phase1API.도메인불러오기(name)
      message.success(`도메인 "${name}" 불러오기 완료`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 불러오기 실패')
    }
  }

  const isSuperUser = currentUser?.user_id === 'super'

  const 컬럼 = [
    {
      title: '도메인',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '액션',
      key: 'action',
      width: 180,
      render: (_: any, record: DomainItem) => (
        <Space>
          <Button size="small" onClick={() => 도메인불러오기(record.name)}>
            불러오기
          </Button>
          {isSuperUser && (
            <Popconfirm
              title={`"${record.name}" 도메인을 삭제하시겠습니까?`}
              onConfirm={() => 도메인삭제(record.name)}
              okText="삭제"
              cancelText="취소"
            >
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder="도메인 이름"
          value={신규도메인}
          onChange={(e) => set신규도메인(e.target.value)}
          onPressEnter={도메인추가}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={도메인추가}
          loading={추가중}
        >
          추가
        </Button>
        <Button icon={<ReloadOutlined />} onClick={목록조회} loading={로딩}>
          새로고침
        </Button>
      </Space>

      <Table
        rowKey="name"
        dataSource={도메인목록}
        columns={컬럼}
        size="small"
        loading={로딩}
        pagination={{ pageSize: 10, size: 'small' }}
      />
    </div>
  )
}
