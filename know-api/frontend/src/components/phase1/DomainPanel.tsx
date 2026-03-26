import { useState, useEffect } from 'react'
import { Table, Button, Input, Select, Space, Popconfirm, message, Tag } from 'antd'
import { CopyOutlined, ReloadOutlined, CheckOutlined } from '@ant-design/icons'
import { phase1API } from '../../api/phase1'

interface DomainItem {
  name: string
}

interface WorkspaceItem {
  name: string
}

interface DomainPanelProps {
  currentUser: { user_id: string; auth: string } | null
}

export default function DomainPanel({ currentUser }: DomainPanelProps) {
  const [도메인목록, set도메인목록] = useState<DomainItem[]>([])
  const [워크스페이스목록, set워크스페이스목록] = useState<WorkspaceItem[]>([])
  const [선택워크스페이스, set선택워크스페이스] = useState<string | undefined>(undefined)
  const [소스도메인, set소스도메인] = useState<string | undefined>(undefined)
  const [새도메인이름, set새도메인이름] = useState('')
  const [새워크스페이스이름, set새워크스페이스이름] = useState('')
  const [로딩, set로딩] = useState(false)
  const [복사중, set복사중] = useState(false)
  const [워크스페이스생성중, set워크스페이스생성중] = useState(false)
  const [워크스페이스삭제중, set워크스페이스삭제중] = useState(false)

  const isSuperUser = currentUser?.user_id === 'super'

  const 전체조회 = async () => {
    set로딩(true)
    try {
      const [도메인응답, 워크스페이스응답] = await Promise.all([
        phase1API.도메인목록(),
        phase1API.워크스페이스목록(),
      ])
      set도메인목록((도메인응답.data.domains || []).map((name: string) => ({ name })))
      set워크스페이스목록((워크스페이스응답.data.workspaces || []).map((name: string) => ({ name })))
    } catch {
      message.error('목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => { 전체조회() }, [])

  const 도메인복사 = async () => {
    if (!소스도메인) { message.warning('소스 도메인을 선택하세요'); return }
    const target = 새도메인이름.trim()
    if (!target) { message.warning('새 도메인 이름을 입력하세요'); return }
    set복사중(true)
    try {
      await phase1API.도메인복사(소스도메인, target)
      message.success(`도메인 "${소스도메인}" → "${target}" 복사 완료`)
      set소스도메인(undefined)
      set새도메인이름('')
      전체조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 복사 실패')
    } finally {
      set복사중(false)
    }
  }

  const 도메인적용 = async (name: string) => {
    if (!선택워크스페이스) { message.warning('워크스페이스를 먼저 선택하세요'); return }
    try {
      await phase1API.도메인적용(name, 선택워크스페이스)
      message.success(`도메인 "${name}" → 워크스페이스 "${선택워크스페이스}" 적용 완료`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 적용 실패')
    }
  }

  const 도메인삭제 = async (name: string) => {
    try {
      await phase1API.도메인삭제(name)
      message.success(`도메인 "${name}" 삭제 완료`)
      전체조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '도메인 삭제 실패')
    }
  }

  const 워크스페이스생성 = async () => {
    const name = 새워크스페이스이름.trim()
    if (!name) { message.warning('워크스페이스 이름을 입력하세요'); return }
    set워크스페이스생성중(true)
    try {
      await phase1API.워크스페이스생성(name)
      message.success(`워크스페이스 "${name}" 생성 완료`)
      set새워크스페이스이름('')
      전체조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '워크스페이스 생성 실패')
    } finally {
      set워크스페이스생성중(false)
    }
  }

  const 워크스페이스삭제 = async () => {
    if (!선택워크스페이스) { message.warning('삭제할 워크스페이스를 선택하세요'); return }
    set워크스페이스삭제중(true)
    try {
      await phase1API.워크스페이스삭제(선택워크스페이스)
      message.success(`워크스페이스 "${선택워크스페이스}" 삭제 완료`)
      set선택워크스페이스(undefined)
      전체조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '워크스페이스 삭제 실패')
    } finally {
      set워크스페이스삭제중(false)
    }
  }

  const 도메인컬럼 = [
    {
      title: '도메인',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '액션',
      key: 'action',
      width: 160,
      render: (_: any, record: DomainItem) => (
        <Space>
          <Button
            size="small"
            icon={<CheckOutlined />}
            onClick={() => 도메인적용(record.name)}
          >
            적용
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

  const 워크스페이스컬럼 = [
    {
      title: '워크스페이스',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Tag color="green">{name}</Tag>,
    },
  ]

  return (
    <div>
      {/* 도메인 복사행 */}
      <Space style={{ marginBottom: 8 }}>
        <Select
          placeholder="소스 도메인 선택"
          value={소스도메인}
          onChange={set소스도메인}
          style={{ width: 180 }}
          options={도메인목록.map((d) => ({ label: d.name, value: d.name }))}
        />
        <Input
          placeholder="새 도메인 이름"
          value={새도메인이름}
          onChange={(e) => set새도메인이름(e.target.value)}
          onPressEnter={도메인복사}
          style={{ width: 160 }}
        />
        <Button
          type="primary"
          icon={<CopyOutlined />}
          onClick={도메인복사}
          loading={복사중}
        >
          복사
        </Button>
        <Button icon={<ReloadOutlined />} onClick={전체조회} loading={로딩}>
          새로고침
        </Button>
      </Space>

      {/* 워크스페이스행 */}
      <Space style={{ marginBottom: 12 }}>
        <Select
          placeholder="워크스페이스 선택"
          value={선택워크스페이스}
          onChange={set선택워크스페이스}
          style={{ width: 180 }}
          options={워크스페이스목록.map((w) => ({ label: w.name, value: w.name }))}
        />
        <Input
          placeholder="새 워크스페이스 이름"
          value={새워크스페이스이름}
          onChange={(e) => set새워크스페이스이름(e.target.value)}
          onPressEnter={워크스페이스생성}
          style={{ width: 160 }}
        />
        <Button
          type="primary"
          onClick={워크스페이스생성}
          loading={워크스페이스생성중}
        >
          워크스페이스 생성
        </Button>
        {isSuperUser && (
          <Popconfirm
            title={`"${선택워크스페이스}" 워크스페이스를 삭제하시겠습니까?`}
            onConfirm={워크스페이스삭제}
            okText="삭제"
            cancelText="취소"
            disabled={!선택워크스페이스}
          >
            <Button
              danger
              loading={워크스페이스삭제중}
              disabled={!선택워크스페이스}
            >
              워크스페이스 삭제
            </Button>
          </Popconfirm>
        )}
      </Space>

      {/* 도메인 테이블 */}
      <Table
        rowKey="name"
        dataSource={도메인목록}
        columns={도메인컬럼}
        size="small"
        loading={로딩}
        pagination={{ pageSize: 10, size: 'small' }}
        style={{ marginBottom: 16 }}
      />

      {/* 워크스페이스 목록 테이블 */}
      <Table
        rowKey="name"
        dataSource={워크스페이스목록}
        columns={워크스페이스컬럼}
        size="small"
        loading={로딩}
        pagination={{ pageSize: 5, size: 'small' }}
        title={() => '워크스페이스 목록'}
      />
    </div>
  )
}
