package cn.qing.schedule;

import android.app.*;
import android.content.*;
import android.os.Build;
import org.json.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class ReminderReceiver extends BroadcastReceiver {
 static final int REFRESH=999999;
 static JSONObject data(Context c){try{return new JSONObject(c.getSharedPreferences("qing",0).getString("data","{}"));}catch(Exception e){return new JSONObject();}}
 static PendingIntent alarm(Context c,int id,Intent i){return PendingIntent.getBroadcast(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 public static synchronized void schedule(Context c){
  AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);android.content.SharedPreferences p=c.getSharedPreferences("qing",0);int count=p.getInt("alarmCount",0);for(int i=0;i<count;i++)am.cancel(alarm(c,i,new Intent(c,ReminderReceiver.class).setAction("cn.qing.LESSON")));
  am.cancel(alarm(c,REFRESH,new Intent(c,ReminderReceiver.class).setAction("cn.qing.REFRESH")));int total=0;
  try{JSONObject d=data(c),s=d.optJSONObject("settings");if(s==null||!("school".equals(s.optString("timeSource"))||"manual".equals(s.optString("timeSource"))))return;int before=s.optInt("reminder",0);if(before<=0)return;LocalDate start=LocalDate.parse(s.optString("startDate"));if(start.getDayOfWeek()!=DayOfWeek.MONDAY)return;
   JSONArray courses=d.optJSONArray("courses"),times=s.optJSONArray("times");if(courses==null||times==null)return;ZoneId zone=ZoneId.systemDefault();long now=System.currentTimeMillis();LocalDate today=LocalDate.now(zone);
   NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);nm.createNotificationChannel(new NotificationChannel("courses","课前提醒",NotificationManager.IMPORTANCE_DEFAULT));
   for(int offset=0;offset<7;offset++){LocalDate date=today.plusDays(offset);int week=(int)Math.floorDiv(ChronoUnit.DAYS.between(start,date),7)+1;if(week<1||week>s.optInt("weeks",20))continue;
    for(int j=0;j<courses.length()&&total<200;j++){JSONObject x=courses.getJSONObject(j);if(x.optInt("day")!=date.getDayOfWeek().getValue()||!hasWeek(x.optJSONArray("weeks"),week))continue;int section=x.optInt("start")-1;if(section<0||section>=times.length())continue;String time=times.getJSONObject(section).optString("start");long due=date.atTime(LocalTime.parse(time)).atZone(zone).toInstant().toEpochMilli()-before*60000L;if(due<=now)continue;
     Intent i=new Intent(c,ReminderReceiver.class).setAction("cn.qing.LESSON").putExtra("title",x.optString("name")).putExtra("body",time+" · "+x.optString("room")+" · 第"+(section+1)+"节");am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,due,alarm(c,total++,i));
    }
   }
   long next=today.plusDays(1).atTime(0,10).atZone(zone).toInstant().toEpochMilli();am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,alarm(c,REFRESH,new Intent(c,ReminderReceiver.class).setAction("cn.qing.REFRESH")));
  }catch(Exception ignored){}finally{p.edit().putInt("alarmCount",total).apply();}
 }
 static boolean hasWeek(JSONArray weeks,int w){if(weeks==null)return false;for(int i=0;i<weeks.length();i++)if(weeks.optInt(i)==w)return true;return false;}
 @Override public void onReceive(Context c,Intent intent){if("cn.qing.LESSON".equals(intent.getAction())){if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
  NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);nm.createNotificationChannel(new NotificationChannel("courses","课前提醒",NotificationManager.IMPORTANCE_DEFAULT));PendingIntent tap=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  nm.notify((int)(System.currentTimeMillis()%Integer.MAX_VALUE),new Notification.Builder(c,"courses").setSmallIcon(R.drawable.icon).setContentTitle(intent.getStringExtra("title")).setContentText(intent.getStringExtra("body")).setContentIntent(tap).setAutoCancel(true).build());
 }else{schedule(c);}ScheduleWidget.refresh(c);}
}
