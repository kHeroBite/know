import React from 'react'
import { Modal, Button } from 'antd'

export interface CompleteModalProps {
  open: boolean
  onCancel: () => void
  workedCount: number
  totalCount: number
  loading: boolean
  onComplete: (mode: 'all_complete' | 'all_incomplete' | 'by_history') => void
}

export default function CompleteModal({
  open, onCancel, workedCount, totalCount, loading, onComplete,
}: CompleteModalProps) {
  return (
    <Modal
      title="작업 완료 처리"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={420}
    >
      <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
        처리 대상: <strong>{workedCount}</strong> / {totalCount} 키워드 작업됨
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button
          block
          type="primary"
          loading={loading}
          onClick={() => onComplete('by_history')}
        >
          작업이력 기준 처리
        </Button>
        <Button
          block
          loading={loading}
          onClick={() => onComplete('all_complete')}
        >
          전체 완료 처리
        </Button>
        <Button
          block
          loading={loading}
          onClick={() => onComplete('all_incomplete')}
        >
          전체 미완료 처리
        </Button>
        <Button block onClick={onCancel}>
          취소
        </Button>
      </div>
    </Modal>
  )
}
