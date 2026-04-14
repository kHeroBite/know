import { useState, useEffect, useCallback } from 'react'
import { Table, Radio, Button, InputNumber, Select, Tag, Typography, Card, Space, Statistic, Row, Col, message, Modal } from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { assignmentApi, KeywordItem, AssignmentStats } from '../api/assignment'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI } from '../api/workspace'
import PageHeader from '../components/PageHeader'

const { Title, Text } = Typography
const PAGE_SIZE = 20

const 건수선택옵션 = [
  { label: '1,000', value: 1000 },
  { label: '5,000', value: 5000 },
  { label: '10,000', value: 10000 },
  { label: '50,000', value: 50000 },
  { label: '100,000', value: 100000 },
  { label: '150,000', value: 150000 },
  { label: '200,000', value: 200000 },
  { label: '전체', value: -1 },
]

const 분석결과렌더 = (analysis: string) => {
  const lines = analysis.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('<<')) {
      return <div key={i} style={{ color: '#1890ff', fontWeight: 'bold' }}>{line}</div>
    } else if (line.startsWith('comp :')) {
      return <div key={i} style={{ color: '#faad14' }}>{line}</div>
    }
    return <div key={i}>{line}</div>
  })
}

export default function Assignment() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedWorkspace, selectedDomain } = useWorkspaceStore()
  const [stats, setStats] = useState<AssignmentStats>({ total: 0, pending: 0, assigned: 0, completed: 0, reprocess_count: 0 })
  const [isReprocessMode, setIsReprocessMode] = useState(false)
  const [filter, setFilter] = useState<string>('pending')
  const [items, setItems] = useState<KeywordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KeywordItem | null>(null)

  // 할당 영역
  const [fromLine, setFromLine] = useState(1)
  const [toLine, setToLine] = useState(1000)

  const 통계조회 = useCallback(async () => {
    if (!selectedWorkspace || !selectedDomain) return
    try {
      const { data } = await assignmentApi.통계(selectedWorkspace, selectedDomain)
      const reprocessMode = data.reprocess_count > 0
      setIsReprocessMode(reprocessMode)
      if (reprocessMode) {
        const { data: rData } = await assignmentApi.통계(selectedWorkspace, selectedDomain, 'reprocess')
        setStats(rData)
      } else {
        setStats(data)
      }
    } catch {
      // 통계 조회 실패 무시
    }
  }, [selectedWorkspace, selectedDomain])

  const 목록조회 = useCallback(async (p = page) => {
    if (!selectedWorkspace || !selectedDomain) return
    setLoading(true)
    try {
      const { data } = await assignmentApi.목록(selectedWorkspace, selectedDomain, filter, p, PAGE_SIZE, undefined, isReprocessMode ? 'reprocess' : undefined)
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace, selectedDomain, filter, page, isReprocessMode])

  useEffect(() => {
    통계조회()
    setPage(1)
    setSelectedItem(null)
  }, [selectedWorkspace, selectedDomain, location.key])

  useEffect(() => {
    목록조회(page)
  }, [selectedWorkspace, selectedDomain, filter, page, location.key, isReprocessMode])

  const 할당실행 = async (mode?: string) => {
    if (!selectedWorkspace || !selectedDomain) return
    if (!mode && fromLine > toLine) {
      message.warning('시작 번호가 종료 번호보다 큽니다')
      return
    }
    try {
      const { data } = await assignmentApi.할당(selectedWorkspace, selectedDomain, fromLine, toLine, mode)
      message.success(data.message || (mode === 'reprocess' ? '재처리 할당 완료' : `${fromLine}~${toLine} 할당 완료`))
      await useWorkspaceStore.getState().loadWorkspaceStatus()
      navigate('/knowledge-work')
      통계조회()
      목록조회(1)
      setPage(1)
    } catch (e: any) {
      message.error(e.response?.data?.detail || '할당 실패')
    }
  }

  const 건수선택처리 = (value: number) => {
    if (value === -1) {
      setToLine(stats.total || 1)
    } else {
      setToLine(value)
    }
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'line_num',
      key: 'line_num',
      width: 80,
    },
    {
      title: '키워드',
      dataIndex: 'keyword',
      key: 'keyword',
      ellipsis: true,
    },
    {
      title: '분석결과',
      dataIndex: 'analysis',
      key: 'analysis',
      ellipsis: true,
      render: (text: string) => {
        if (!text) return '-'
        const first = text.split('\n')[0]
        return first.length > 60 ? first.slice(0, 60) + '…' : first
      },
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        if (status === 'assigned') return <Tag color="blue">할당됨</Tag>
        if (status === 'completed') return <Tag color="green">완료</Tag>
        return <Tag>미완료</Tag>
      },
    },
  ]

  if (!selectedWorkspace || !selectedDomain) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">워크스페이스와 도메인을 먼저 선택하세요.</Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="데이터 할당"
        showPrev
        prevLabel="이전단계로 (전처리)"
        onPrev={() => {
          Modal.confirm({
            title: '이전단계로 돌아가시겠습니까?',
            content: '전처리 로그, 키워드 데이터가 모두 초기화됩니다. 데이터 전처리 단계로 돌아갑니다.',
            okText: '확인',
            cancelText: '취소',
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await useWorkspaceStore.getState().revertPhase('preprocess')
                navigate('/preprocess?reset=1')
              } catch (err: any) {
                message.error(err.response?.data?.detail || 'phase 전이 실패')
              }
            },
          })
        }}
        showNext={stats.assigned === 0 && stats.total > 0}
        nextLabel="다음단계로 (사전빌드)"
        onNext={() => {
          Modal.confirm({
            title: '사전 빌드 단계로 진행하시겠습니까?',
            content: `완료: ${stats.completed.toLocaleString()}건 / 전체: ${stats.total.toLocaleString()}건`,
            okText: '확인',
            cancelText: '취소',
            onOk: async () => {
              try {
                await useWorkspaceStore.getState().advancePhase('build')
                navigate('/build-history')
              } catch (err: any) {
                message.error(err.response?.data?.detail || 'phase 전이 실패')
              }
            },
          })
        }}
      />
      {/* 상단: 통계 바 */}
      <Card size="small" title={isReprocessMode ? <Tag color="orange">재처리 모드</Tag> : undefined}>
        <Row gutter={16} align="middle">
          <Col>
            <Statistic title="전체" value={stats.total} />
          </Col>
          <Col>
            <Statistic title="미완료" value={stats.pending} valueStyle={{ color: '#999' }} />
          </Col>
          <Col>
            <Statistic title="할당됨" value={stats.assigned} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col>
            <Statistic title="완료" value={stats.completed} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col flex="auto" />
        </Row>
      </Card>

      {/* 필터 + 할당 영역 */}
      <Card size="small">
        <Row gutter={16} align="middle">
          <Col>
            <Radio.Group value={filter} onChange={e => { setFilter(e.target.value); setPage(1); setSelectedItem(null) }}>
              <Radio.Button value="all">전체</Radio.Button>
              <Radio.Button value="pending">미완료</Radio.Button>
              <Radio.Button value="assigned">할당됨</Radio.Button>
              <Radio.Button value="completed">완료</Radio.Button>
            </Radio.Group>
          </Col>
          <Col flex="auto" />
          <Col>
            {stats.reprocess_count > 0 ? (
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => 할당실행('reprocess')}>
                재처리 대상 {stats.reprocess_count.toLocaleString()}건 할당받기
              </Button>
            ) : (
              <Space>
                <Text>시작</Text>
                <InputNumber min={1} value={fromLine} onChange={v => setFromLine(v || 1)} style={{ width: 100 }} />
                <Text>~</Text>
                <Text>종료</Text>
                <InputNumber min={1} value={toLine} onChange={v => setToLine(v || 1)} style={{ width: 100 }} />
                <Select
                  placeholder="건수 선택"
                  style={{ width: 120 }}
                  options={건수선택옵션}
                  onChange={건수선택처리}
                  allowClear
                />
                <Button type="primary" icon={<UserAddOutlined />} onClick={() => 할당실행()} disabled={filter !== 'pending'}>할당받기</Button>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      {/* 키워드 목록 테이블 */}
      <Card size="small" style={{ flex: 1 }}>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: t => `총 ${t}건`,
            showSizeChanger: false,
            onChange: p => { setPage(p); setSelectedItem(null) },
          }}
          onRow={record => ({
            onClick: () => setSelectedItem(record),
            style: { cursor: 'pointer', background: selectedItem?.id === record.id ? '#e6f7ff' : undefined },
          })}
        />
      </Card>

      {/* 키워드 상세 패널 */}
      {selectedItem && (
        <Card
          size="small"
          title={
            <Space>
              <Tag color="blue">#{selectedItem.line_num}</Tag>
              <Text strong>{selectedItem.keyword}</Text>
            </Space>
          }
        >
          <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
            {분석결과렌더(selectedItem.analysis || '')}
          </div>
        </Card>
      )}
    </div>
  )
}
