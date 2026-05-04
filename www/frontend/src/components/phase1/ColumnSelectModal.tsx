import { useEffect, useMemo, useState } from 'react'
import { Modal, Table, Checkbox, Input, Spin, Tooltip, Space, Typography, message } from 'antd'
import { phase1DataAPI, type ColumnSpec, type ColumnInfo } from '../../api/phase1Data'

const { Text } = Typography

interface ColumnSelectModalProps {
  open: boolean
  onClose: () => void
  workspace?: string
  siteCode?: string
  filenames: string[]
  initialColumns: ColumnSpec[]
  onSave: (columns: ColumnSpec[]) => void
}

interface 컬럼행상태 {
  selected: boolean
  split_delimiter: string
}

export default function ColumnSelectModal({
  open,
  onClose,
  workspace,
  siteCode,
  filenames,
  initialColumns,
  onSave,
}: ColumnSelectModalProps) {
  const [로딩, set로딩] = useState(false)
  const [분석결과, set분석결과] = useState<ColumnInfo[]>([])
  const [행상태, set행상태] = useState<Record<string, 컬럼행상태>>({})
  const [저장중] = useState(false)

  // 컬럼 목록 + 저장된 선택 → 행상태 변환 (기존 선택 유지 우선)
  const 컬럼행상태로변환 = (
    컬럼: ColumnInfo[],
    저장된: ColumnSpec[],
    기존상태: Record<string, 컬럼행상태>
  ): Record<string, 컬럼행상태> => {
    // split_delimiter가 null인 경우도 저장된 값으로 인식하기 위해 name→원본값 맵 사용
    const 저장맵 = new Map(저장된.map(c => [c.name, c.split_delimiter]))
    const 결과: Record<string, 컬럼행상태> = {}
    for (const col of 컬럼) {
      const 추천구분자 = col.suggested_delimiter ?? ''
      if (저장맵.has(col.name)) {
        // 저장된 값 우선 복원 — null은 "구분자 없음"(빈 문자열)으로 변환
        결과[col.name] = {
          selected: true,
          split_delimiter: 저장맵.get(col.name) ?? '',
        }
      } else {
        // 저장된 값 없음 — 기존 행상태 유지 또는 추천 구분자로 초기화
        결과[col.name] = {
          selected: 기존상태[col.name]?.selected ?? false,
          split_delimiter: 기존상태[col.name]?.split_delimiter ?? 추천구분자,
        }
      }
    }
    return 결과
  }

  // 모달 열릴 때마다 컬럼 분석 호출
  useEffect(() => {
    if (!open) return
    if (filenames.length === 0) {
      message.warning('분석할 업로드 파일이 없습니다')
      return
    }
    // 모달 open 즉시 initialColumns를 행상태에 반영 (분석 완료 전에도 복원)
    // 분석결과가 없으면 name만 키로 삼아 임시 적용
    if (initialColumns.length > 0) {
      const 저장맵 = new Map(initialColumns.map(c => [c.name, c.split_delimiter]))
      set행상태(prev => {
        const next: Record<string, 컬럼행상태> = { ...prev }
        for (const c of initialColumns) {
          next[c.name] = {
            selected: true,
            split_delimiter: 저장맵.get(c.name) ?? '',
          }
        }
        return next
      })
    }
    const 분석실행 = async () => {
      set로딩(true)
      try {
        const { data } = await phase1DataAPI.컬럼분석(filenames, workspace)
        const 컬럼: ColumnInfo[] = data.columns || []
        set분석결과(컬럼)
        // 분석 완료 후 최신 initialColumns로 merge (선택상태 우선 보존)
        set행상태(prev => 컬럼행상태로변환(컬럼, initialColumns, prev))
      } catch (err: any) {
        message.error(err.response?.data?.detail || '컬럼 분석 실패')
        set분석결과([])
        set행상태({})
      } finally {
        set로딩(false)
      }
    }
    분석실행()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filenames.join(','), workspace])

  // initialColumns가 나중에 채워지면(비동기 로딩) 분석결과에 prefill 재적용
  useEffect(() => {
    if (!open || 분석결과.length === 0) return
    set행상태(prev => 컬럼행상태로변환(분석결과, initialColumns, prev))
  }, [initialColumns])

  const 체크변경 = (name: string, checked: boolean) => {
    set행상태(prev => ({
      ...prev,
      [name]: { ...(prev[name] ?? { selected: false, split_delimiter: '' }), selected: checked },
    }))
  }

  const 구분자변경 = (name: string, value: string) => {
    set행상태(prev => ({
      ...prev,
      [name]: { ...(prev[name] ?? { selected: false, split_delimiter: '' }), split_delimiter: value },
    }))
  }

  const 선택컬럼 = useMemo<ColumnSpec[]>(() => {
    const result: ColumnSpec[] = []
    for (const col of 분석결과) {
      const st = 행상태[col.name]
      if (st?.selected) {
        const delim = st.split_delimiter.trim()
        result.push({
          name: col.name,
          split_delimiter: delim.length > 0 ? delim : null,
        })
      }
    }
    return result
  }, [분석결과, 행상태])

  const 저장핸들러 = async () => {
    if (선택컬럼.length === 0) {
      message.warning('최소 1개 이상의 컬럼을 선택하세요')
      return
    }
    // 저장 책임은 부모(Phase1Pipeline)의 onColumnsConfigured에서 담당
    // 여기서는 선택 결과만 전달하고 모달 닫기
    onSave(선택컬럼)
    onClose()
  }

  const 컬럼정의 = [
    {
      title: (
        <Checkbox
          checked={분석결과.length > 0 && 분석결과.every(c => 행상태[c.name]?.selected)}
          indeterminate={
            분석결과.some(c => 행상태[c.name]?.selected) &&
            !분석결과.every(c => 행상태[c.name]?.selected)
          }
          onChange={e => {
            const checked = e.target.checked
            const next: Record<string, 컬럼행상태> = {}
            for (const c of 분석결과) {
              next[c.name] = {
                selected: checked,
                split_delimiter: 행상태[c.name]?.split_delimiter ?? '',
              }
            }
            set행상태(next)
          }}
        />
      ),
      key: 'select',
      width: 48,
      render: (_: any, record: ColumnInfo) => (
        <Checkbox
          checked={행상태[record.name]?.selected ?? false}
          onChange={e => 체크변경(record.name, e.target.checked)}
        />
      ),
    },
    {
      title: '컬럼명',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '샘플값 (최대 10개)',
      dataIndex: 'samples',
      key: 'samples',
      render: (samples: string[]) => {
        if (!samples || samples.length === 0) {
          return <Text type="secondary">-</Text>
        }
        return (
          <Space size={4} wrap>
            {samples.slice(0, 10).map((s, i) => (
              <Tooltip key={i} title={s}>
                <span
                  style={{
                    display: 'inline-block',
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    background: '#f5f5f5',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid #e8e8e8',
                  }}
                >
                  {s}
                </span>
              </Tooltip>
            ))}
          </Space>
        )
      },
    },
    {
      title: 'split 구분자',
      key: 'delimiter',
      width: 160,
      render: (_: any, record: ColumnInfo) => (
        <Input
          size="small"
          placeholder={
            record.suggested_delimiter
              ? `추천: "${record.suggested_delimiter}"`
              : '예: " > " 또는 ","'
          }
          value={행상태[record.name]?.split_delimiter ?? ''}
          onChange={e => 구분자변경(record.name, e.target.value)}
          disabled={!행상태[record.name]?.selected}
        />
      ),
    },
  ]

  return (
    <Modal
      title="컬럼 선택"
      open={open}
      onOk={저장핸들러}
      onCancel={onClose}
      okText="저장"
      cancelText="취소"
      confirmLoading={저장중}
      width={900}
      destroyOnClose
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">
          {siteCode ? `사이트: ${siteCode} · ` : '사이트 미선택 · '}
          업로드 파일 {filenames.length}개 기준 컬럼 분석 결과
        </Text>
      </div>
      <Spin spinning={로딩}>
        <Table
          rowKey="name"
          size="small"
          columns={컬럼정의}
          dataSource={분석결과}
          pagination={false}
          scroll={{ y: 420 }}
          locale={{ emptyText: 로딩 ? '컬럼 분석 중...' : '분석된 컬럼이 없습니다' }}
        />
      </Spin>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Text type="secondary">선택 컬럼: {선택컬럼.length}개</Text>
      </div>
    </Modal>
  )
}
