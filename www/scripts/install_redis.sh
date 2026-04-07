#!/bin/bash
# install_redis.sh — Redis 설치 및 설정 스크립트 (CentOS/RHEL yum 기반)
# 사용법: sudo bash scripts/install_redis.sh

set -e

echo "[1/5] epel-release 설치..."
sudo yum install -y epel-release

echo "[2/5] Redis 설치..."
sudo yum install -y redis

echo "[3/5] Redis 설정 (maxmemory=256mb, maxmemory-policy=allkeys-lru)..."
# maxmemory 설정 (주석 해제 + 값 설정)
sudo sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis.conf
sudo sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis.conf

# sed 패턴이 없을 경우 append 방식으로 fallback
grep -q "^maxmemory 256mb" /etc/redis.conf || echo "maxmemory 256mb" | sudo tee -a /etc/redis.conf
grep -q "^maxmemory-policy allkeys-lru" /etc/redis.conf || echo "maxmemory-policy allkeys-lru" | sudo tee -a /etc/redis.conf

echo "[4/5] Redis 서비스 활성화 및 시작..."
sudo systemctl enable redis
sudo systemctl start redis

echo "[5/5] Redis 상태 확인..."
redis-cli ping

echo ""
echo "Redis 설치 및 설정 완료."
echo "  - maxmemory: 256mb"
echo "  - maxmemory-policy: allkeys-lru"
echo "  - 포트: 6379 (기본값)"
