import { useState, useEffect } from 'react'
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Card,
} from 'antd'
import { workspaceAPI } from '../api/workspace'
import { useAuthStore } from '../stores/authStore'

const { Title } = Typography

interface 워크스페이스항목 {
  name: string
  status: 'IDLE' | 'USED'
  domain: string | null
}

export default function Workspace() {
  const { user: currentUser } = useAuthStore()
  const [목록, set목록] = useState<워크스페이스항목[]>([])
  const [도메인목록, set도메인목록] = useState<string[]>([])
  const [로딩, set로딩] = useState(false)
  const [새이름, set새이름] = useState('')
  const [선택중, set선택중] = useState<string | null>(null)
  const [선택도메인, set선택도메인] = useState<string | null>(null)
  const [생성로딩, set생성로딩] = useState(false)

  const isSuper = currentUser?.user_id === 'super'

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [wsRes, dmRes] = await Promise.all([
        workspaceAPI.워크스페이스목록(),
        workspaceAPI.도메인목록(),
      ])
      set목록(wsRes.data)
      set도메인목록(dmRes.data)
    } catch {
      message.error('목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => {
    목록조회()
  }, [])

  const 생성핸들러 = async () => {
    if (!새이름.trim()) {
      message.warning('이름을 입력하세요')
      return
    }
    set생성로딩(true)
    try {
      await workspaceAPI.워크스페이스생성(새이름.trim())
      message.success(`워크스페이스 "${새이름}" 생성 완료`)
      set새이름('')
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '생성 실패')
    } finally {
      set생성로딩(false)
    }
  }

  const 삭제핸들러 = async (name: string) => {
    try {
      await workspaceAPI.워크스페이스삭제(name)
      message.success(`워크스페이스 "${name}" 삭제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const 연결핸들러 = async (wsName: string) => {
    if (!선택도메인) {
      message.warning('도메인을 선택하세요')
      return
    }
    try {
      await workspaceAPI.도메인연결(wsName, 선택도메인)
      message.success(`"${wsName}"에 도메인 "${선택도메인}" 연결 완료`)
      set선택중(null)
      set선택도메인(null)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '연결 실패')
    }
  }

  const 해제핸들러 = async (wsName: string) => {
    try {
      await workspaceAPI.워크스페이스해제(wsName)
      message.success(`"${wsName}" 해제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '해제 실패')
    }
  }

  const 컬럼 = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) =>
        status === 'IDLE' ? (
          <Tag color="green">IDLE</Tag>
        ) : (
          <Tag color="red">USED</Tag>
        ),
    },
    {
      title: '연결 도메인',
      dataIndex: 'domain',
      key: 'domain',
      render: (domain: string | null) => domain || '-',
    },
    {
      title: '액션',
      key: 'action',
      render: (_: unknown, record: 워크스페이스항목) => (
        <Space size="small" wrap>
          {record.status === 'IDLE' && (
            <>
              {선택중 === record.name ? (
                <>
                  <Select
                    style={{ width: 160 }}
                    placeholder="도메인 선택"
                    options={도메인목록.map(d => ({ label: d, value: d }))}
                    onChange={v => set선택도메인(v)}
                    value={선택도메인}
                  />
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => 연결핸들러(record.name)}
                  >
                    연결
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      set선택중(null)
                      set선택도메인(null)
                    }}
                  >
                    취소
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  onClick={() => {
                    set선택중(record.name)
                    set선택도메인(null)
                  }}
                >
                  선택
                </Button>
              )}
            </>
          )}
          {record.status === 'USED' && (
            <Popconfirm
              title={`"${record.name}" 워크스페이스를 해제하시겠습니까?`}
              onConfirm={() => 해제핸들러(record.name)}
              okText="해제"
              cancelText="취소"
            >
              <Button size="small" danger>
                해제
              </Button>
            </Popconfirm>
          )}
          {isSuper && (
            <Popconfirm
              title={`"${record.name}" 워크스페이스를 삭제하시겠습니까?`}
              onConfirm={() => 삭제핸들러(record.name)}
              okText="삭제"
              cancelText="취소"
              disabled={record.status === 'USED'}
            >
              <Button
                size="small"
                danger
                disabled={record.status === 'USED'}
              >
                삭제
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={3}>워크스페이스</Title>
      {isSuper && (
        <Card style={{ marginBottom: 16 }}>
          <Space>
            <Input
              placeholder="워크스페이스 이름"
              value={새이름}
              onChange={e => set새이름(e.target.value)}
              onPressEnter={생성핸들러}
              style={{ width: 200 }}
            />
            <Button type="primary" onClick={생성핸들러} loading={생성로딩}>
              생성
            </Button>
          </Space>
        </Card>
      )}
      <Table
        dataSource={목록}
        columns={컬럼}
        rowKey="name"
        loading={로딩}
        pagination={false}
      />
    </div>
  )
}
