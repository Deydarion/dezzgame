#!/bin/bash
# Автоматическая установка deezgame.ru на сервер
# Запустите: bash auto-install.sh

set -e  # Остановка при ошибке

echo "🚀 Начинаем установку deezgame.ru..."
echo ""

# 1. Обновление системы
echo "📦 1. Обновление системы..."
apt update
apt upgrade -y

# 2. Установка Node.js 20
echo "📦 2. Установка Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version

# 3. Установка Git
echo "📦 3. Установка Git..."
apt install -y git

# 4. Установка PM2
echo "📦 4. Установка PM2..."
npm install -g pm2

# 5. Установка Nginx
echo "📦 5. Установка Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 6. Клонирование проекта
echo "📦 6. Клонирование проекта..."
mkdir -p ~/apps
cd ~/apps
if [ -d "dezzgame" ]; then
    echo "Папка dezzgame уже существует, обновляем..."
    cd dezzgame
    git fetch --all
    git reset --hard origin/main
else
    git clone https://github.com/Deydarion/dezzgame.git
    cd dezzgame
fi

# 7. Установка зависимостей сервера
echo "📦 7. Установка зависимостей сервера..."
cd ~/apps/dezzgame/server
npm install

# 8. Сборка сервера
echo "📦 8. Сборка сервера..."
npm run build

# 9. Создание конфигурации PM2
echo "📦 9. Настройка PM2..."
cat > ecosystem.config.js << 'EOFPM2'
module.exports = {
  apps: [{
    name: 'deezgame-server',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
EOFPM2

# 10. Запуск сервера
echo "📦 10. Запуск сервера с PM2..."
pm2 delete deezgame-server 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

# 11. Установка зависимостей клиента
echo "📦 11. Установка зависимостей клиента..."
cd ~/apps/dezzgame/client
npm install

# 12. Сборка клиента
echo "📦 12. Сборка клиента..."
npm run build

# 13. Настройка Nginx
echo "📦 13. Настройка Nginx..."
cat > /etc/nginx/sites-available/deezgame << 'EOFNGINX'
# Конфигурация БЕЗ SSL (certbot добавит HTTPS автоматически)
server {
    listen 80;
    listen [::]:80;
    server_name deezgame.ru www.deezgame.ru;
    
    # Статические файлы клиента
    root /root/apps/dezzgame/client/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Основной роут для клиента
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # WebSocket и API проксирование на backend
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
    
    # API endpoints (если есть)
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOFNGINX

# Удаление старых конфигураций
rm -f /etc/nginx/sites-enabled/deezgame
rm -f /etc/nginx/sites-enabled/default

# Активация конфигурации
ln -s /etc/nginx/sites-available/deezgame /etc/nginx/sites-enabled/

# Проверка и перезапуск Nginx
nginx -t
systemctl restart nginx

# 14. Установка Certbot
echo "📦 14. Установка Certbot..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "✅ Базовая установка завершена!"
echo ""
echo "📋 Следующие шаги:"
echo ""
echo "1. Настройте DNS для домена deezgame.ru:"
echo "   A Record: @ -> 109.172.37.254"
echo "   A Record: www -> 109.172.37.254"
echo ""
echo "2. После настройки DNS (подождите 5-10 минут), установите SSL:"
echo "   sudo certbot --nginx -d deezgame.ru -d www.deezgame.ru"
echo ""
echo "3. Проверьте статус:"
echo "   pm2 status"
echo "   pm2 logs deezgame-server"
echo ""
echo "4. Ваш сайт доступен на:"
echo "   http://deezgame.ru (пока без SSL)"
echo "   После SSL: https://deezgame.ru"
echo ""
echo "🎉 Готово!"

