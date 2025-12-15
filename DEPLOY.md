# 🚀 Инструкция по установке Dess Game на Ubuntu сервер

## 📋 Содержание
1. [Подключение по SSH](#1-подключение-по-ssh)
2. [Установка зависимостей](#2-установка-зависимостей)
3. [Клонирование проекта](#3-клонирование-проекта)
4. [Настройка сервера](#4-настройка-сервера)
5. [Настройка клиента](#5-настройка-клиента)
6. [Запуск с PM2](#6-запуск-с-pm2)
7. [Настройка Nginx](#7-настройка-nginx)
8. [Установка SSL сертификата](#8-установка-ssl-сертификата)
9. [Настройка домена](#9-настройка-домена)
10. [Частые ошибки и решения](#10-частые-ошибки-и-решения)

---

## 1. Подключение по SSH

### Подключение к серверу
```bash
# Подключение по паролю
ssh username@your_server_ip

# Подключение по ключу
ssh -i /path/to/private_key username@your_server_ip
```

### Создание SSH ключа (если нет)
```bash
# На локальной машине
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Копирование ключа на сервер
ssh-copy-id username@your_server_ip
```

### Проверка подключения
```bash
# После подключения проверьте систему
lsb_release -a
uname -a
```

---

## 2. Установка зависимостей

### Обновление системы
```bash
sudo apt update
sudo apt upgrade -y
```

### Установка Node.js (версия 18+)
```bash
# Добавление репозитория NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Установка Node.js и npm
sudo apt install -y nodejs

# Проверка версии
node --version  # Должно быть >= v18.0.0
npm --version
```

### Установка Git
```bash
sudo apt install -y git
git --version
```

### Установка PM2 (менеджер процессов)
```bash
sudo npm install -g pm2
pm2 --version
```

### Установка Nginx (веб-сервер)
```bash
sudo apt install -y nginx
sudo systemctl status nginx
```

---

## 3. Клонирование проекта

### Создание директории для проекта
```bash
# Создаем директорию
mkdir -p ~/apps
cd ~/apps

# Клонируем проект
git clone https://github.com/Deydarion/dezzgame.git
cd dezzgame
```

**Альтернатива:** Если репозиторий приватный или вы загружаете через FTP/SFTP:
```bash
# Используйте FileZilla, WinSCP или scp команду
# На вашей локальной Windows машине:
scp -r "C:\Visual Studio Projects\chess" username@server_ip:~/apps/dezzgame

# Или используйте WinSCP / FileZilla для графической загрузки
```

---

## 4. Настройка сервера

### Переход в директорию сервера
```bash
cd ~/apps/chess/server
```

### Установка зависимостей
```bash
npm install
```

### Создание production конфигурации
```bash
# Создаем .env файл
nano .env
```

Добавьте в `.env`:
```env
NODE_ENV=production
PORT=3001
```

### Проверка запуска
```bash
# Тестовый запуск
npm run build
npm start

# Если все работает, остановите Ctrl+C
```

---

## 5. Настройка клиента

### Переход в директорию клиента
```bash
cd ~/apps/chess/client
```

### Установка зависимостей
```bash
npm install
```

### Настройка URL сервера
```bash
nano src/App.tsx
```

Найдите строку с подключением Socket.IO и измените на ваш домен:
```typescript
const newSocket = io('https://deezgame.ru', {  // Было: 'http://localhost:3001'
  transports: ['websocket', 'polling'],
  // ...
})
```

### Сборка production версии
```bash
npm run build
```

После сборки появится папка `dist/` с готовыми файлами.

---

## 6. Запуск с PM2

### Запуск сервера с PM2
```bash
cd ~/apps/chess/server

# Создаем ecosystem файл для PM2
nano ecosystem.config.js
```

Содержимое `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'chess-server',
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
```

### Запуск приложения
```bash
# Запуск
pm2 start ecosystem.config.js

# Сохранение конфигурации для автозапуска
pm2 save
pm2 startup
# Выполните команду, которую покажет PM2

# Проверка статуса
pm2 status
pm2 logs chess-server
```

### Полезные команды PM2
```bash
pm2 list              # Список процессов
pm2 logs chess-server # Просмотр логов
pm2 restart chess-server  # Перезапуск
pm2 stop chess-server     # Остановка
pm2 delete chess-server   # Удаление процесса
pm2 monit             # Мониторинг в реальном времени
```

---

## 7. Настройка Nginx

### Создание конфигурации для сайта
```bash
sudo nano /etc/nginx/sites-available/chess-game
```

Содержимое конфига:
```nginx
# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name deezgame.ru www.deezgame.ru;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name deezgame.ru www.deezgame.ru;

    # SSL сертификаты (после установки Certbot)
    ssl_certificate /etc/letsencrypt/live/deezgame.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deezgame.ru/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

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
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Увеличиваем таймауты для WebSocket
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
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host $host;
    }
}
```

### Активация конфигурации
```bash
# Создаем символическую ссылку
sudo ln -s /etc/nginx/sites-available/chess-game /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

---

## 8. Установка SSL сертификата

### Установка Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Получение сертификата
```bash
# Автоматическая установка SSL с Certbot
sudo certbot --nginx -d deezgame.ru -d www.deezgame.ru

# Следуйте инструкциям:
# 1. Введите email
# 2. Согласитесь с условиями (A)
# 3. Выберите опцию редиректа (рекомендуется 2)
```

### Автообновление сертификата
```bash
# Certbot автоматически добавляет cron job
# Проверка:
sudo certbot renew --dry-run

# Cron job уже настроен, но можно проверить:
sudo systemctl status certbot.timer
```

---

## 9. Настройка домена

### На регистраторе домена (например, Namecheap, GoDaddy)

1. **Войдите в панель управления доменом**

2. **Найдите раздел DNS настроек** (DNS Management, Advanced DNS, и т.д.)

3. **Добавьте A-записи:**
   ```
   Type: A Record
   Host: @
   Value: YOUR_SERVER_IP
   TTL: Automatic (or 3600)

   Type: A Record
   Host: www
   Value: YOUR_SERVER_IP
   TTL: Automatic (or 3600)
   ```

4. **Опционально: добавьте CNAME для поддомена**
   ```
   Type: CNAME
   Host: game
   Value: deezgame.ru
   TTL: Automatic
   ```

5. **Сохраните изменения**

⏰ **Важно:** DNS изменения могут занять от 5 минут до 48 часов для распространения.

### Проверка DNS
```bash
# Проверка A-записи
dig deezgame.ru +short
nslookup deezgame.ru

# Должен вернуться IP вашего сервера
```

---

## 10. Частые ошибки и решения

### ❌ Ошибка: "Could not get lock /var/lib/dpkg/lock-frontend"
**Полная ошибка:**
```
Waiting for cache lock: Could not get lock /var/lib/dpkg/lock-frontend. 
It is held by process XXXX (apt)
```

**Причина:** Другой процесс apt/dpkg уже выполняется (обычно автоматическое обновление системы).

**Решение 1 (Рекомендуется - подождать):**
```bash
# Проверьте какой процесс использует apt
ps aux | grep -i apt

# Подождите 2-5 минут пока автообновление завершится
# Затем повторите команду
```

**Решение 2 (Если процесс завис):**
```bash
# Найдите PID процесса
sudo lsof /var/lib/dpkg/lock-frontend

# Убейте процесс (замените XXXX на реальный PID)
sudo kill -9 XXXX

# Удалите файлы блокировки
sudo rm /var/lib/dpkg/lock-frontend
sudo rm /var/lib/dpkg/lock
sudo rm /var/cache/apt/archives/lock

# Переконфигурируйте dpkg
sudo dpkg --configure -a

# Обновите список пакетов
sudo apt update
```

**Решение 3 (Для свежих серверов - отключить автообновление):**
```bash
# Остановите службу автообновления
sudo systemctl stop unattended-upgrades
sudo systemctl disable unattended-upgrades

# Теперь можете устанавливать пакеты
sudo apt update
sudo apt upgrade -y

# После установки можете включить обратно
sudo systemctl enable unattended-upgrades
sudo systemctl start unattended-upgrades
```

### ❌ Ошибка: "EADDRINUSE: Port 3001 already in use"
**Решение:**
```bash
# Найти процесс на порту
sudo lsof -i :3001
# или
sudo netstat -tulpn | grep 3001

# Убить процесс
sudo kill -9 PID

# Перезапустить PM2
pm2 restart chess-server
```

### ❌ Ошибка: "502 Bad Gateway" в Nginx
**Причины и решения:**

1. **Backend не запущен:**
   ```bash
   pm2 status
   pm2 restart chess-server
   pm2 logs chess-server
   ```

2. **Неправильный порт в Nginx:**
   ```bash
   # Проверьте что backend слушает на 3001
   sudo nano /etc/nginx/sites-available/chess-game
   # proxy_pass должен быть http://localhost:3001
   ```

3. **Файрвол блокирует:**
   ```bash
   sudo ufw allow 3001
   sudo ufw reload
   ```

### ❌ Ошибка: "npm: command not found"
**Решение:**
```bash
# Переустановите Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка
node --version
npm --version
```

### ❌ Ошибка: "Permission denied" при установке
**Решение:**
```bash
# Не используйте sudo для npm install в проекте!
# Если уже использовали, исправьте права:
sudo chown -R $USER:$USER ~/apps/chess
cd ~/apps/chess/server
rm -rf node_modules package-lock.json
npm install
```

### ❌ Ошибка: WebSocket connection failed
**Причины и решения:**

1. **CORS проблема - обновите server/src/index.ts:**
   ```typescript
   const io = new Server(httpServer, {
     cors: {
       origin: ['https://deezgame.ru', 'https://www.deezgame.ru'],
       methods: ['GET', 'POST'],
       credentials: true
     }
   })
   ```

2. **Nginx не пробрасывает WebSocket:**
   ```bash
   # Проверьте наличие этих заголовков в конфиге Nginx:
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

### ❌ Ошибка: "Cannot GET /" после деплоя клиента
**Решение:**
```bash
# Проверьте что index.html есть в dist
ls ~/apps/chess/client/dist/

# Если пусто - пересоберите:
cd ~/apps/chess/client
npm run build

# Проверьте права на файлы:
sudo chown -R www-data:www-data ~/apps/chess/client/dist
```

### ❌ Ошибка: SSL certificate problem
**Решение:**
```bash
# Проверка сертификата
sudo certbot certificates

# Перевыпуск сертификата
sudo certbot --nginx --force-renewal -d deezgame.ru

# Проверка Nginx конфига
sudo nginx -t
sudo systemctl restart nginx
```

### ❌ Высокая нагрузка на сервер
**Решение:**
```bash
# Мониторинг ресурсов
htop
pm2 monit

# Ограничение памяти для Node.js
pm2 delete chess-server
pm2 start ecosystem.config.js --max-memory-restart 500M

# Включение gzip в Nginx (уже есть в конфиге выше)
```

---

## 🔄 Обновление приложения

### При обновлении кода:
```bash
cd ~/apps/chess

# Получить изменения
git pull origin main

# Обновить сервер
cd server
npm install
npm run build
pm2 restart chess-server

# Обновить клиент
cd ../client
npm install
npm run build

# Перезапустить Nginx
sudo systemctl reload nginx
```

---

## 📊 Мониторинг

### Просмотр логов
```bash
# PM2 логи
pm2 logs chess-server

# Nginx логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Системные логи
sudo journalctl -u nginx -f
```

### Мониторинг производительности
```bash
# CPU и память
htop

# PM2 мониторинг
pm2 monit

# Дисковое пространство
df -h
```

---

## 🎉 Готово!

Теперь ваша игра доступна по адресу:
- **HTTPS:** https://deezgame.ru
- **HTTP:** автоматически редиректится на HTTPS

### Полезные ссылки:
- PM2: https://pm2.keymetrics.io/
- Nginx: https://nginx.org/ru/docs/
- Certbot: https://certbot.eff.org/
- Node.js: https://nodejs.org/

---

**Автор:** Ваше имя  
**Последнее обновление:** 15 декабря 2024  
**Лицензия:** MIT

