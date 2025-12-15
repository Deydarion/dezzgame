# 🚀 Быстрая установка deezgame.ru

## 1. На сервере - Получить актуальные файлы

```bash
cd ~/apps/dezzgame
git fetch --all
git reset --hard origin/main

# Проверить версию
git log --oneline -1
```

## 2. Собрать сервер

```bash
cd ~/apps/dezzgame/server
npm install
npm run build
```

## 3. Собрать клиент

```bash
cd ~/apps/dezzgame/client
npm install
npm run build
```

## 4. Запустить сервер с PM2

```bash
cd ~/apps/dezzgame/server

# Создать ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
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
EOF

# Запустить
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Проверить
pm2 status
pm2 logs deezgame-server
```

## 5. Настроить Nginx

```bash
# Скопировать конфигурацию
sudo cp ~/apps/dezzgame/nginx-deezgame.conf /etc/nginx/sites-available/deezgame

# Активировать
sudo ln -s /etc/nginx/sites-available/deezgame /etc/nginx/sites-enabled/

# Проверить конфигурацию
sudo nginx -t

# Перезапустить Nginx
sudo systemctl restart nginx
```

## 6. Установить SSL

```bash
# Установить Certbot (если еще не установлен)
sudo apt install -y certbot python3-certbot-nginx

# Получить сертификат
sudo certbot --nginx -d deezgame.ru -d www.deezgame.ru

# Следуйте инструкциям:
# 1. Введите email
# 2. Согласитесь с условиями (A)
# 3. Выберите опцию редиректа (2)
```

## 7. Проверить DNS

Убедитесь что A-записи настроены у регистратора домена:

```
Type: A Record
Host: @
Value: YOUR_SERVER_IP

Type: A Record  
Host: www
Value: YOUR_SERVER_IP
```

Проверить:
```bash
dig deezgame.ru +short
# Должен вернуть IP вашего сервера
```

## 8. Готово! 🎉

Ваша игра доступна на:
- https://deezgame.ru
- https://www.deezgame.ru

## Полезные команды

```bash
# Проверить статус сервера
pm2 status
pm2 logs deezgame-server

# Перезапустить сервер
pm2 restart deezgame-server

# Проверить Nginx
sudo nginx -t
sudo systemctl status nginx

# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Обновить код
cd ~/apps/dezzgame
git pull origin main
cd server && npm run build && pm2 restart deezgame-server
cd ../client && npm run build
```

## Если что-то не работает

См. раздел "Частые ошибки" в DEPLOY.md

