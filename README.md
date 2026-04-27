# Dankbarkeitstagebuch

## App starten

```bash
npm start
```

Am PC ist die App danach erreichbar unter:

```text
http://localhost:3000
```

Der Server lauscht auch im lokalen Netzwerk. Beim Start zeigt die Konsole zusaetzlich eine Adresse wie:

```text
Network: http://192.168.178.23:3000
```

## Auf dem Handy testen

1. PC und Handy muessen im gleichen WLAN sein.
2. Starte die App auf dem PC mit `npm start`.
3. Oeffne auf dem Handy die angezeigte Netzwerkadresse:

```text
http://<PC-IP>:3000
```

Beispiel:

```text
http://192.168.178.23:3000
```

## Lokale IP unter Windows finden

In PowerShell:

```powershell
ipconfig
```

Suche beim aktiven WLAN-Adapter nach `IPv4-Adresse`. Diese Adresse verwendest du auf dem Handy mit Port `3000`.

## Hinweis zu Mikrofonaufnahme

Viele mobile Browser schraenken Mikrofonzugriff auf normalen `http://<ip>`-Seiten ein. Wenn Datei-Upload funktioniert, aber Recording am Handy nicht, liegt das wahrscheinlich daran. Fuer echtes Handy-Recording ist spaeter HTTPS oder Hosting sinnvoll.

## HTTPS-Test mit ngrok

Fuer Mikrofonaufnahme auf dem Handy ist HTTPS oft noetig. Das gilt besonders fuer mobile Browser wie Brave oder Chrome, weil `http://192.168.x.x:3000` fuer `getUserMedia` meistens kein sicherer Kontext ist.

1. Starte die App lokal:

```bash
node server.js
```

2. Installiere ngrok, falls es noch nicht installiert ist:

```bash
ngrok
```

Die Installation ist je nach System unterschiedlich. Unter Windows kannst du ngrok von der offiziellen Website herunterladen oder ueber einen Paketmanager installieren.

3. Starte den HTTPS-Tunnel:

```bash
ngrok http 3000
```

4. Oeffne auf dem Handy die angezeigte HTTPS-Adresse, zum Beispiel:

```text
https://abc123.ngrok-free.app
```

Hinweise:

- Mikrofonzugriff funktioniert auf mobilen Browsern meist nur ueber HTTPS oder `localhost`.
- Brave Shields koennen Mikrofonzugriff blockieren. Deaktiviere Brave Shields ggf. fuer die ngrok-Seite.
- Pruefe unter Android die Mikrofonberechtigung fuer Brave oder Chrome.
- Der Node-Server muss auf dem PC weiterlaufen, solange du die ngrok-URL nutzt.

## Deployment auf Render

1. Pushe das Projekt in ein GitHub Repository.
2. Oeffne Render und waehle `New` -> `Web Service`.
3. Verbinde dein GitHub Repository.
4. Nutze folgende Einstellungen:

```text
Build Command: npm install
Start Command: npm start
```

5. Hinterlege bei Render die Umgebungsvariable:

```text
OPENAI_API_KEY=dein_api_key
```

Render setzt den Port ueber `process.env.PORT`. Die App ist dafuer vorbereitet und startet weiterhin lokal auf Port `3000`, wenn keine Render-Portvariable vorhanden ist.

Render stellt HTTPS bereit. Dadurch funktioniert die Mikrofonaufnahme im Browser deutlich zuverlaessiger als ueber eine lokale `http://192.168.x.x:3000` Adresse.

Wichtig: `entries.json` liegt auf dem lokalen Dateisystem des Render-Dienstes. Ohne Persistent Disk oder Datenbank ist diese Datei nicht dauerhaft sicher, zum Beispiel bei Rebuilds oder Instanzwechseln. Exportiere deshalb regelmaessig ein Backup ueber `Backup exportieren`.
