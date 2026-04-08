import React from 'react'
import { Modal, Input, Button, message } from 'antd'
import 클라이언트 from '../../api/client'

export interface LLMPromptModalProps {
  open: boolean
  onCancel: () => void
  llm프롬프트: string
  setLlm프롬프트: (v: string) => void
  기본추천프롬프트: string
}

export default function LLMPromptModal({
  open, onCancel, llm프롬프트, setLlm프롬프트, 기본추천프롬프트,
}: LLMPromptModalProps) {
  return (
    <Modal
      title="유사어 추천 LLM 프롬프트"
      open={open}
      onCancel={onCancel}
      onOk={() => {
        클라이언트.put('/llm-settings/thesaurus-prompt', { prompt: llm프롬프트 })
          .then(() => message.success('프롬프트 저장 완료'))
          .catch(() => message.error('프롬프트 저장 실패'))
        onCancel()
      }}
      okText="저장"
      cancelText="취소"
      width={600}
      zIndex={1100}
    >
      <Input.TextArea
        value={llm프롬프트}
        onChange={e => setLlm프롬프트(e.target.value)}
        rows={10}
        style={{ fontFamily: 'monospace', fontSize: 12 }}
      />
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Button size="small" onClick={() => setLlm프롬프트(기본추천프롬프트)}>기본값 복원</Button>
      </div>
    </Modal>
  )
}
