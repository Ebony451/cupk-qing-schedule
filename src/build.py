"""Build without Gradle. Requires JDK 21, Android SDK platform/build-tools 35."""
from pathlib import Path
import os, subprocess, zipfile, secrets, hashlib, json, shutil, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
TMP = ROOT / 'tmp'
OUT = ROOT / 'out'
JAVA = Path(os.environ['JAVA_HOME']) / 'bin'
SDK = Path(os.environ.get('QING_SDK', str(TMP / 'sdk')))
BT = SDK / 'build-tools-35'
ANDROID = SDK / 'android.jar'
MANIFEST = ET.parse(SRC/'AndroidManifest.xml').getroot()
VERSION = MANIFEST.attrib['{http://schemas.android.com/apk/res/android}versionName']

def run(args):
    work = TMP/'build'
    normalized = []
    for a in args:
        if isinstance(a,Path) and a.is_relative_to(work): a=a.relative_to(work)
        normalized.append(str(a))
    p = subprocess.run(normalized, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try: output=p.stdout.decode('utf-8')
    except UnicodeDecodeError: output=p.stdout.decode('gb18030',errors='replace')
    with (TMP / 'build.log').open('a', encoding='utf-8') as f:
        f.write(output + '\n')
    if p.returncode:
        raise RuntimeError(output)

def build():
    for required in ('index.html','app.js','app.css','core.js','cupk-import.js','portal-viewport.js'):
        if not (SRC/'assets'/required).is_file():
            raise RuntimeError('Required UI asset is missing: '+required)
    OUT.mkdir(exist_ok=True)
    work = TMP / 'build'
    work.mkdir(exist_ok=True)
    for folder in ('res','assets'):
        shutil.copytree(SRC/folder,work/folder,dirs_exist_ok=True)
    shutil.copy2(SRC/'AndroidManifest.xml',work/'AndroidManifest.xml')
    shutil.copy2(ANDROID,work/'android.jar')
    (TMP / 'build.log').write_text('', encoding='utf-8')
    classes = work / 'classes'
    classes.mkdir(exist_ok=True)
    generated = work / 'generated'
    generated.mkdir(exist_ok=True)
    res = work / 'resources.zip'
    run([BT/'aapt2.exe','compile','--dir',work/'res','-o',res])
    unsigned = work / 'unsigned.apk'
    run([BT/'aapt2.exe','link','-o',unsigned,'-I',work/'android.jar','--manifest',work/'AndroidManifest.xml','--java',generated,'-A',work/'assets',res])
    sources = list((SRC/'java').rglob('*.java')) + list(generated.rglob('*.java'))
    run([JAVA/'javac.exe','-encoding','UTF-8','-source','8','-target','8','-classpath',ANDROID,'-d',classes,*sources])
    run([JAVA/'java.exe','-cp',BT/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',ANDROID,'--output',work,*classes.rglob('*.class')])
    with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED) as z:
        z.write(work/'classes.dex','classes.dex')
    aligned = work/'aligned.apk'
    run([BT/'zipalign.exe','-f','-p','4',unsigned,aligned])
    private = ROOT/'private'
    private.mkdir(exist_ok=True)
    key = private/'release.jks'
    pwfile=private/'store-password.txt'
    if not key.exists():
        pwfile.write_text(secrets.token_urlsafe(24),encoding='ascii')
        run([JAVA/'keytool.exe','-genkeypair','-keystore',key,'-storepass:file',pwfile,'-keypass:file',pwfile,'-alias','qing','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Qing Schedule, O=Independent, C=CN'])
    apk=OUT/('轻课表_'+VERSION+'.apk')
    run([JAVA/'java.exe','-jar',BT/'lib/apksigner.jar','sign','--ks',key,'--ks-pass','file:'+str(pwfile),'--ks-key-alias','qing','--out',apk,aligned])
    run([JAVA/'java.exe','-jar',BT/'lib/apksigner.jar','verify','--verbose','--print-certs',apk])
    shutil.copy2(apk,work/'verified.apk')
    run([BT/'aapt2.exe','dump','badging',work/'verified.apk'])
    (OUT/('APK校验_'+VERSION+'.json')).write_text(json.dumps({'file':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'package':'cn.qing.schedule','minAndroid':'8.0','version':VERSION},ensure_ascii=False,indent=2),encoding='utf-8')
    print('APK:',apk)
    print('Bytes:',apk.stat().st_size)

if __name__=='__main__': build()
