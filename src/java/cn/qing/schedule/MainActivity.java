package cn.qing.schedule;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.graphics.Color;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
 WebView app, portal; LinearLayout root; TextView status; Button readButton, modeButton; ProgressBar portalProgress; Handler handler=new Handler(Looper.getMainLooper());
 boolean desktopMode=true;
 boolean importing=false, extracting=false; int attempts=0, extractionGeneration=0;
 String exportContent; ValueCallback<Uri[]> fileCallback;
 static final String HOME="https://eams.cupk.edu.cn/student/home";
 @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Color.rgb(244,249,247));getWindow().setNavigationBarColor(Color.WHITE);root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(Color.WHITE);setContentView(root);
  root.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets x=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(x.left,x.top,x.right,x.bottom);}else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  app=new WebView(this); WebSettings s=app.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(true);s.setAllowContentAccess(true);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
  app.addJavascriptInterface(new Bridge(),"Native");app.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){return !req.getUrl().toString().startsWith("file:///android_asset/");}});
  app.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,102);return true;}});
  root.addView(app,new LinearLayout.LayoutParams(-1,-1)); app.loadUrl("file:///android_asset/index.html"); ReminderReceiver.schedule(this);ScheduleWidget.refresh(this);
 }
 public class Bridge {
  @JavascriptInterface public String load(){return getSharedPreferences("qing",0).getString("data","");}
  @JavascriptInterface public void save(String data){try{JSONObject obj=new JSONObject(data);if(data.length()>2000000)throw new Exception("课表数据过大");getSharedPreferences("qing",0).edit().putString("data",obj.toString()).apply();handler.post(()->{ReminderReceiver.schedule(MainActivity.this);ScheduleWidget.refresh(MainActivity.this);if(Build.VERSION.SDK_INT>=33&&obj.optJSONObject("settings")!=null&&obj.optJSONObject("settings").optInt("reminder",0)>0&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},103);});}catch(Exception e){notify("保存失败："+e.getMessage());}}
  @JavascriptInterface public void openImport(){handler.post(()->showPortal());}
  @JavascriptInterface public void notify(String text){handler.post(()->Toast.makeText(MainActivity.this,text,Toast.LENGTH_LONG).show());}
  @JavascriptInterface public void clearSession(){handler.post(()->{CookieManager.getInstance().removeAllCookies(ok->Toast.makeText(MainActivity.this,"教务登录状态已清除",Toast.LENGTH_SHORT).show());WebStorage.getInstance().deleteAllData();if(portal!=null)portal.clearCache(true);});}
  @JavascriptInterface public void exportFile(String name,String mime,String content){handler.post(()->{if(content.length()>4000000){notify("导出内容过大");return;}exportContent=content;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime);i.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(i,101);});}
 }
 void showPortal(){
  if(importing)return;
  importing=true;root.removeView(app);
  View screen=getLayoutInflater().inflate(R.layout.import_portal,root,false);
  root.addView(screen,new LinearLayout.LayoutParams(-1,-1));
  status=screen.findViewById(R.id.portal_status);portal=screen.findViewById(R.id.portal_web);
  readButton=screen.findViewById(R.id.portal_read);modeButton=screen.findViewById(R.id.portal_mode);portalProgress=screen.findViewById(R.id.portal_progress);
  screen.findViewById(R.id.portal_close).setOnClickListener(v->closePortal());
  screen.findViewById(R.id.portal_course).setOnClickListener(v->{cancelExtraction();portal.loadUrl("https://eams.cupk.edu.cn/student/for-std/course-table");});
  readButton.setOnClickListener(v->extract());
  modeButton.setOnClickListener(v->{cancelExtraction();desktopMode=!desktopMode;getSharedPreferences("qing",0).edit().putBoolean("desktopMode",desktopMode).apply();configurePortalMode();portal.reload();});
  WebSettings s=portal.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportZoom(true);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setTextZoom(100);
  desktopMode=getSharedPreferences("qing",0).getBoolean("desktopMode",true);configurePortalMode();
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(portal,false);
  portal.setWebChromeClient(new WebChromeClient(){@Override public void onProgressChanged(WebView v,int progress){if(!importing||v!=portal)return;portalProgress.setProgress(progress);portalProgress.setVisibility(progress<100?View.VISIBLE:View.INVISIBLE);}});
  portal.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !"https".equalsIgnoreCase(r.getUrl().getScheme());}
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(!importing||v!=portal)return;cancelExtraction();status.setText("正在加载校方页面…\n读取按钮固定在屏幕底部，登录后先点「① 个人课表」。");}
   @Override public void onPageCommitVisible(WebView v,String url){applyPortalViewport(v,url);}
   @Override public void onPageFinished(WebView v,String url){if(!importing||v!=portal)return;applyPortalViewport(v,url);if(!extracting)status.setText((desktopMode?"电脑模式":"手机模式")+" · "+Uri.parse(url).getHost()+"\n登录后点底部「① 个人课表」，选好学期，再点「② 读取课表」。可双指缩放网页。");}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(importing&&v==portal&&r.isForMainFrame()){cancelExtraction();status.setText("页面无法加载，请检查网络或校园网连接后重试。");}}
  });
  portal.loadUrl(HOME);
 }
 void configurePortalMode(){
  String mobile=WebSettings.getDefaultUserAgent(this);
  String desktop=mobile.replaceFirst("\\([^)]*\\)","(X11; Linux x86_64)").replace(" Version/4.0","").replace(" Mobile","");
  portal.getSettings().setUserAgentString(desktopMode?desktop:mobile);portal.setInitialScale(0);
  modeButton.setText(desktopMode?"电脑模式":"手机模式");modeButton.setContentDescription(desktopMode?"当前为电脑模式，点击切换手机模式":"当前为手机模式，点击切换电脑模式");
 }
 void applyPortalViewport(WebView view,String url){
  if(!importing||view!=portal)return;Uri uri=Uri.parse(url);
  if(!"https".equals(uri.getScheme())||!"eams.cupk.edu.cn".equals(uri.getHost()))return;
  try{view.evaluateJavascript(asset("portal-viewport.js")+"\nwindow.QingPortalViewport.setDesktop("+desktopMode+");void 0;",null);}catch(IOException ignored){}
 }
 void reading(boolean value){extracting=value;if(readButton!=null){readButton.setEnabled(!value);readButton.setAlpha(value?0.65f:1f);readButton.setText(value?"正在读取…":"② 读取课表");}}
 void cancelExtraction(){++extractionGeneration;reading(false);}
 boolean validPortal(){if(portal==null)return false;Uri uri=Uri.parse(portal.getUrl()==null?"":portal.getUrl());return "https".equals(uri.getScheme())&&"eams.cupk.edu.cn".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/student/")&&!uri.getPath().contains("login");}
 String asset(String name)throws IOException{try(InputStream i=getAssets().open(name);ByteArrayOutputStream o=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=i.read(b))>0)o.write(b,0,n);return new String(o.toByteArray(),StandardCharsets.UTF_8);}}
 void extract(){if(extracting)return;if(!validPortal()){status.setText("请先完成校方登录，再点底部「① 个人课表」进入学期课表，然后读取。");return;}try{reading(true);attempts=0;int generation=++extractionGeneration;status.setText("正在读取当前学期课表…完成后会显示预览，请稍候。");portal.evaluateJavascript(asset("cupk-import.js")+"\nwindow.QingImport.run();void 0;",v->poll(generation));}catch(Exception e){reading(false);status.setText("读取失败："+e.getMessage());}}
 void poll(int generation){if(generation!=extractionGeneration||!importing||portal==null)return;if(!validPortal()){reading(false);status.setText("登录已失效或页面已改变，请重新登录并读取。");return;}portal.evaluateJavascript("JSON.stringify(window.__qingImport||{status:'pending'})",raw->{if(generation!=extractionGeneration||!importing)return;try{Object decoded=new JSONTokener(raw).nextValue();JSONObject state=new JSONObject(decoded instanceof String?(String)decoded:"{}");String st=state.optString("status");if("done".equals(st)){reading(false);JSONObject result=state.optJSONObject("result");if(result==null)throw new Exception("没有返回可识别的课表");String js="window.Qing.receiveImport("+result.toString()+");";closePortal();app.evaluateJavascript(js,null);return;}if("error".equals(st)){reading(false);status.setText("读取失败："+state.optString("message",state.optString("error","请进入个人课表后重试")));return;}if(++attempts>=160){reading(false);status.setText("读取超时，请进入个人课表页后重试。");return;}handler.postDelayed(()->poll(generation),500);}catch(Exception e){reading(false);status.setText("解析失败："+e.getMessage());}});}
 void closePortal(){cancelExtraction();importing=false;if(portal!=null){portal.stopLoading();portal.destroy();portal=null;}readButton=null;modeButton=null;portalProgress=null;root.removeAllViews();root.addView(app,new LinearLayout.LayoutParams(-1,-1));}
 @Override public void onBackPressed(){if(importing){if(portal!=null&&portal.canGoBack())portal.goBack();else closePortal();}else app.evaluateJavascript("window.Qing?window.Qing.back():false",handled->{if(!"true".equals(handled))MainActivity.super.onBackPressed();});}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==102){if(fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}}if(request==101&&result==RESULT_OK&&data!=null&&exportContent!=null){try(OutputStream o=getContentResolver().openOutputStream(data.getData())){o.write(exportContent.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"文件已保存",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"保存失败",Toast.LENGTH_LONG).show();}finally{exportContent=null;}}}
 @Override protected void onDestroy(){++extractionGeneration;if(portal!=null)portal.destroy();if(app!=null)app.destroy();super.onDestroy();}
}
