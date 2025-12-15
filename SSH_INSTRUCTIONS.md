# 🔐 Инструкция по установке через SSH

## Шаг 1: Подключитесь к серверу

### Из PowerShell (Windows):
```powershell
ssh root@109.172.37.254
# Введите пароль: N7Ijlhb!FwEG
```

### Из терминала (Mac/Linux):
```bash
ssh root@109.172.37.254
# Введите пароль: N7Ijlhb!FwEG
```

## Шаг 2: Скопируйте и запустите автоустановку

После подключения выполните:

```bash
# Скачать скрипт автоустановки
curl -o auto-install.sh https://raw.githubusercontent.com/Deydarion/dezzgame/main/auto-install.sh

# Сделать исполняемым
chmod +x auto-install.sh

# Запустить
bash auto-install.sh
```

**ИЛИ** скопируйте скрипт вручную (см. файл `auto-install.sh` в проекте)

## Шаг 3: Настройте DNS

Пока скрипт работает, зайдите в панель управления доменом **deezgame.ru** и добавьте:

### A-записи:
```
Type: A
Host: @
Value: 109.172.37.254
TTL: 3600

Type: A
Host: www
Value: 109.172.37.254
TTL: 3600
```

## Шаг 4: Проверьте DNS (через 5-10 минут)

```bash
dig deezgame.ru +short
# Должно вернуть: 109.172.37.254

ping deezgame.ru
```

## Шаг 5: Установите SSL

```bash
sudo certbot --nginx -d deezgame.ru -d www.deezgame.ru
```

Следуйте инструкциям:
1. Введите email
2. Нажмите `A` (agree)
3. Нажмите `Y` или `N` для новостей
4. Выберите `2` (redirect)

## ✅ Готово!

Ваш сайт доступен на:
- **HTTP:** http://deezgame.ru
- **HTTPS:** https://deezgame.ru (после установки SSL)

## 🔧 Полезные команды

```bash
# Статус сервера
pm2 status
pm2 logs deezgame-server

# Перезапуск
pm2 restart deezgame-server

# Логи Nginx
sudo tail -f /var/log/nginx/error.log

# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx
```

## ❌ Если что-то пошло не так

### Порт 3001 занят:
```bash
sudo lsof -i :3001
sudo kill -9 PID
pm2 restart deezgame-server
```

### 502 Bad Gateway:
```bash
pm2 logs deezgame-server
# Проверьте ошибки
pm2 restart deezgame-server
```

### SSL не работает:
```bash
# Проверьте что DNS настроен
dig deezgame.ru +short

# Переустановите сертификат
sudo certbot --nginx --force-renewal -d deezgame.ru
```

