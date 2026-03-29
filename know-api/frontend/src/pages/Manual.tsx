import { Typography, Collapse, Image, Table, Alert, Divider, Tag, Space } from 'antd'
import {
  BookOutlined,
  LoginOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  TagsOutlined,
  PlayCircleOutlined,
  BulbOutlined,
  BarChartOutlined,
  HistoryOutlined,
  UserOutlined,
  CodeOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography
const { Panel } = Collapse

const imgStyle: React.CSSProperties = {
  border: '1px solid #e8e8e8',
  borderRadius: 8,
  marginBottom: 16,
}

export default function Manual() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Title level={3}><BookOutlined /> 사용 매뉴얼</Title>
      <Paragraph type="secondary">
        지식작업소 v2.0 사용 가이드 — 각 섹션을 클릭하여 상세 내용을 확인하세요.
      </Paragraph>

      <Collapse defaultActiveKey={['1']} accordion>
        {/* 1. 시작하기 */}
        <Panel header={<span><LoginOutlined /> 1. 시작하기 (로그인)</span>} key="1">
          <Image src="/manual/login.png" width="100%" style={imgStyle} />
          <Paragraph>
            브라우저에서 <Text code>http://서버주소:18000</Text>에 접속하면 로그인 화면이 표시됩니다.
          </Paragraph>
          <Alert
            type="info"
            showIcon
            message="초기 관리자 계정"
            description={
              <span>
                아이디: <Text strong>admin</Text> / 비밀번호: <Text strong>1111</Text>
                <br />
                최초 로그인 후 반드시 비밀번호를 변경하세요.
              </span>
            }
            style={{ marginBottom: 16 }}
          />
          <Paragraph>
            비밀번호는 <Tag color="blue">bcrypt</Tag> 단방향 해시로 저장되므로 복호화가 불가능합니다.
            비밀번호를 분실한 경우, 관리자에게 초기화를 요청하거나 서버 CLI 도구를 사용하세요.
          </Paragraph>
        </Panel>

        {/* 2. 워크스페이스 */}
        <Panel header={<span><AppstoreOutlined /> 2. 워크스페이스</span>} key="2">
          <Image src="/manual/workspace.png" width="100%" style={imgStyle} />
          <Paragraph>
            워크스페이스는 검색엔진 서버와 연결하여 작업할 도메인을 선택하는 공간입니다.
          </Paragraph>
          <Divider orientation="left" plain>워크스페이스 상태</Divider>
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={[
              { key: '1', status: 'IDLE', color: 'default', desc: '생성 직후 초기 상태. 아직 연결 시도 없음' },
              { key: '2', status: 'CONNECTING', color: 'processing', desc: '서버 연결 중. 잠시 대기' },
              { key: '3', status: 'USED', color: 'success', desc: '서버 연결 완료. 작업 가능 상태' },
              { key: '4', status: 'FAILED', color: 'error', desc: '연결 실패. 서버 주소/포트 확인 필요' },
            ]}
            columns={[
              { title: '상태', dataIndex: 'status', width: 120, render: (v: string, r: any) => <Tag color={r.color}>{v}</Tag> },
              { title: '설명', dataIndex: 'desc' },
            ]}
          />
          <Divider orientation="left" plain>사용 방법</Divider>
          <Paragraph>
            <ol>
              <li><Text strong>워크스페이스 생성</Text>: 이름과 서버 주소(호스트:포트)를 입력하여 생성합니다.</li>
              <li><Text strong>도메인 연결</Text>: 생성한 워크스페이스를 선택 후, 연결할 도메인(예: EPOST)을 지정합니다.</li>
              <li><Text strong>연결 확인</Text>: 상태가 <Tag color="success">USED</Tag>로 변경되면 정상 연결된 것입니다.</li>
              <li><Text strong>해제/삭제</Text>: 워크스페이스를 해제(도메인 연결 끊기)하거나 삭제할 수 있습니다.</li>
              <li><Text strong>색상 설정</Text>: 워크스페이스별 테마 색상을 지정하여 구분할 수 있습니다.</li>
            </ol>
          </Paragraph>
        </Panel>

        {/* 3. 데이터 전처리 */}
        <Panel header={<span><ThunderboltOutlined /> 3. 데이터 전처리</span>} key="3">
          <Image src="/manual/preprocess.png" width="100%" style={imgStyle} />
          <Paragraph>
            데이터 전처리는 원본 파일을 검색엔진에 적합한 형태로 변환하는 4단계 파이프라인입니다.
          </Paragraph>
          <Alert
            type="warning"
            showIcon
            message="사전 조건"
            description="워크스페이스를 먼저 선택해야 전처리 기능을 사용할 수 있습니다."
            style={{ marginBottom: 16 }}
          />
          <Divider orientation="left" plain>4단계 처리 과정</Divider>
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={[
              { key: '1', step: '1단계', name: '파일 선택', desc: '처리할 원본 파일을 선택합니다. 여러 파일 동시 선택 가능.' },
              { key: '2', step: '2단계', name: '정제', desc: '원본 텍스트에서 불필요한 문자/태그를 제거하고 정규화합니다.' },
              { key: '3', step: '3단계', name: '형태소 분석', desc: '정제된 텍스트를 형태소 단위로 분석합니다.' },
              { key: '4', step: '4단계', name: '결과 변환', desc: '분석 결과를 검색엔진에 입력할 수 있는 포맷으로 변환합니다.' },
            ]}
            columns={[
              { title: '단계', dataIndex: 'step', width: 80 },
              { title: '이름', dataIndex: 'name', width: 120 },
              { title: '설명', dataIndex: 'desc' },
            ]}
          />
          <Paragraph>
            각 단계는 순차적으로 실행되며, 진행 상태와 로그를 실시간으로 확인할 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 4. 사전 관리 */}
        <Panel header={<span><FileTextOutlined /> 4. 사전 관리</span>} key="4">
          <Image src="/manual/dictionary.png" width="100%" style={imgStyle} />
          <Paragraph>
            검색 품질 향상을 위한 사전을 관리합니다. 세 종류의 사전 탭이 제공됩니다.
          </Paragraph>
          <Divider orientation="left" plain>사전 종류</Divider>
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={[
              { key: '1', type: 'UDIC', name: '사용자 사전', desc: '형태소 분석기가 인식할 사용자 정의 단어 목록' },
              { key: '2', type: 'CNDIC', name: '복합명사 사전', desc: '두 개 이상의 단어가 결합된 복합명사 등록' },
              { key: '3', type: 'THESAURUS', name: '유의어 사전', desc: '동의어/유의어 그룹 정의 (검색 확장용)' },
            ]}
            columns={[
              { title: '코드', dataIndex: 'type', width: 110, render: (v: string) => <Tag>{v}</Tag> },
              { title: '이름', dataIndex: 'name', width: 130 },
              { title: '설명', dataIndex: 'desc' },
            ]}
          />
          <Paragraph>
            <Text strong>기본 기능:</Text> 단어 추가, 검색(키워드 필터), 개별 삭제가 가능합니다.
            사전 변경 후에는 빌드를 실행해야 검색엔진에 반영됩니다.
          </Paragraph>
        </Panel>

        {/* 5. 카테고리 관리 */}
        <Panel header={<span><TagsOutlined /> 5. 카테고리 관리</span>} key="5">
          <Image src="/manual/category.png" width="100%" style={imgStyle} />
          <Paragraph>
            검색 결과의 카테고리 분류를 관리합니다.
          </Paragraph>
          <Divider orientation="left" plain>데이터 구조</Divider>
          <Paragraph>
            각 항목은 <Text code>word</Text>(키워드)와 <Text code>display_category</Text>(표시 카테고리)로 구성됩니다.
            특정 키워드가 검색되었을 때 해당 카테고리를 함께 표시하여 사용자에게 분류 정보를 제공합니다.
          </Paragraph>
          <Paragraph>
            카테고리 추가, 검색, 삭제 기능을 제공하며, 사전과 마찬가지로 변경 후 빌드가 필요합니다.
          </Paragraph>
        </Panel>

        {/* 6. 파이프라인 */}
        <Panel header={<span><PlayCircleOutlined /> 6. 파이프라인</span>} key="6">
          <Image src="/manual/pipeline.png" width="100%" style={imgStyle} />
          <Paragraph>
            실행된 데이터 처리 파이프라인의 이력을 관리합니다.
          </Paragraph>
          <Paragraph>
            각 파이프라인 실행의 상태(성공/실패/진행중), 시작 시간, 종료 시간, 처리된 파일 수 등의 정보를 확인할 수 있습니다.
            실패한 파이프라인은 로그를 통해 원인을 파악하고 재실행할 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 7. 지식작업 */}
        <Panel header={<span><BulbOutlined /> 7. 지식작업</span>} key="7">
          <Image src="/manual/knowledge.png" width="100%" style={imgStyle} />
          <Paragraph>
            파일 업로드 및 작업 분배를 통해 지식 데이터를 관리합니다.
          </Paragraph>
          <Paragraph>
            원본 문서 파일을 업로드하고, 작업자에게 분배하여 지식 데이터를 체계적으로 구축할 수 있습니다.
            작업 현황과 진행 상태를 한눈에 파악할 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 8. 통계 */}
        <Panel header={<span><BarChartOutlined /> 8. 통계</span>} key="8">
          <Image src="/manual/statistics.png" width="100%" style={imgStyle} />
          <Paragraph>
            도메인별 사전 현황을 통계로 확인합니다.
          </Paragraph>
          <Paragraph>
            각 도메인(EPOST, KPOST 등)에 등록된 사전(UDIC, CNDIC, THESAURUS) 항목 수,
            카테고리 수, 최근 빌드 일시 등의 통계 정보를 제공합니다.
            데이터 현황을 빠르게 파악하여 관리 우선순위를 정할 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 9. 빌드이력 */}
        <Panel header={<span><HistoryOutlined /> 9. 빌드이력</span>} key="9">
          <Image src="/manual/buildhistory.png" width="100%" style={imgStyle} />
          <Paragraph>
            사전 빌드 실행 기록을 확인합니다.
          </Paragraph>
          <Paragraph>
            사전/카테고리 변경 후 빌드를 실행하면, 변경사항이 검색엔진에 반영됩니다.
            빌드 일시, 대상 도메인, 빌드 결과(성공/실패), 소요 시간 등의 이력을 관리합니다.
            빌드 실패 시 로그를 통해 원인을 확인할 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 10. 계정 관리 */}
        <Panel header={<span><UserOutlined /> 10. 계정 관리 (관리자 전용)</span>} key="10">
          <Image src="/manual/accounts.png" width="100%" style={imgStyle} />
          <Alert
            type="warning"
            showIcon
            message="관리자 전용 메뉴"
            description="이 메뉴는 관리자(A) 권한으로 로그인한 경우에만 사이드바에 표시됩니다."
            style={{ marginBottom: 16 }}
          />
          <Divider orientation="left" plain>주요 기능</Divider>
          <Paragraph>
            <ul>
              <li><Text strong>계정 생성</Text>: 새 사용자 계정을 생성합니다 (아이디, 이름, 이메일, 권한 설정).</li>
              <li><Text strong>계정 수정</Text>: 기존 계정의 이름, 이메일, 권한을 변경합니다.</li>
              <li><Text strong>비밀번호 초기화</Text>: 사용자의 비밀번호를 초기값(1111)으로 재설정합니다.</li>
              <li><Text strong>계정 삭제</Text>: 더 이상 사용하지 않는 계정을 제거합니다.</li>
            </ul>
          </Paragraph>
          <Divider orientation="left" plain>권한 체계</Divider>
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={[
              { key: '1', auth: 'A', name: '관리자', desc: '모든 기능 + 계정 관리 접근 가능' },
              { key: '2', auth: 'W', name: '작업자(쓰기)', desc: '사전/카테고리 등록·수정·삭제 가능' },
              { key: '3', auth: 'R', name: '조회자(읽기)', desc: '데이터 조회만 가능 (수정 불가)' },
            ]}
            columns={[
              { title: '권한', dataIndex: 'auth', width: 80, render: (v: string) => <Tag color={v === 'A' ? 'red' : v === 'W' ? 'blue' : 'default'}>{v}</Tag> },
              { title: '이름', dataIndex: 'name', width: 120 },
              { title: '설명', dataIndex: 'desc' },
            ]}
          />
          <Paragraph>
            이메일을 등록해두면 비밀번호 분실 시 초기화 안내를 받을 수 있습니다.
          </Paragraph>
        </Panel>

        {/* 11. 서버 CLI 도구 */}
        <Panel header={<span><CodeOutlined /> 11. 서버 CLI 도구</span>} key="11">
          <Alert
            type="info"
            showIcon
            message="서버 관리자용 CLI 명령어"
            description="아래 명령어는 서버에 SSH 접속 후 터미널에서 실행합니다."
            style={{ marginBottom: 16 }}
          />

          <Divider orientation="left" plain>DB 초기화</Divider>
          <Paragraph>
            <Text code>python3 init_db.py</Text>
            <br />
            데이터베이스 테이블을 초기화하고 기본 관리자 계정(admin/1111)을 생성합니다.
            <br />
            <Text type="danger">주의: 기존 데이터가 모두 삭제됩니다.</Text>
          </Paragraph>

          <Divider orientation="left" plain>비밀번호 초기화</Divider>
          <Paragraph>
            <Text code>python3 init_db.py --reset-password admin</Text>
            <br />
            지정한 계정의 비밀번호를 초기값(1111)으로 재설정합니다.
            DB의 다른 데이터에는 영향을 주지 않습니다.
          </Paragraph>

          <Divider orientation="left" plain>사전 파일 임포트</Divider>
          <Paragraph>
            <Text code>python3 init_db.py --import EPOST udic /path/to/file.txt</Text>
            <br />
            외부 텍스트 파일의 사전 데이터를 DB로 일괄 등록합니다.
          </Paragraph>

          <Divider orientation="left" plain>파일 형식 안내</Divider>
          <Table
            size="small"
            pagination={false}
            dataSource={[
              { key: '1', type: 'UDIC', format: '한 줄에 한 단어', example: '인공지능\n딥러닝\n자연어처리' },
              { key: '2', type: 'THESAURUS', format: '탭(Tab) 구분', example: '자동차\\t차량\\t카' },
              { key: '3', type: 'CATEGORY', format: '탭(Tab) 구분', example: 'AI\\t인공지능' },
            ]}
            columns={[
              { title: '사전 유형', dataIndex: 'type', width: 110, render: (v: string) => <Tag>{v}</Tag> },
              { title: '형식', dataIndex: 'format', width: 140 },
              { title: '예시', dataIndex: 'example', render: (v: string) => <Text code style={{ whiteSpace: 'pre' }}>{v}</Text> },
            ]}
          />
        </Panel>
      </Collapse>

      <Divider />
      <Paragraph type="secondary" style={{ textAlign: 'center', fontSize: 12 }}>
        지식작업소 v2.0 · 문의: 시스템 관리자에게 연락하세요
      </Paragraph>
    </div>
  )
}
