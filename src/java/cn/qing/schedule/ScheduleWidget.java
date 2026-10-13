package cn.qing.schedule;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.widget.RemoteViews;
import org.json.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class ScheduleWidget extends AppWidgetProvider {
 public static void refresh(Context c){AppWidgetManager m=AppWidgetManager.getInstance(c);int[] ids=m.getAppWidgetIds(new ComponentName(c,ScheduleWidget.class));if(ids.length>0)new ScheduleWidget().onUpdate(c,m,ids);}
 @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids){String text="先设置开学日期并导入课程";try{JSONObject d=ReminderReceiver.data(c),s=d.optJSONObject("settings");LocalDate start=LocalDate.parse(s.optString("startDate")),today=LocalDate.now();int week=(int)Math.floorDiv(ChronoUnit.DAYS.between(start,today),7)+1;JSONArray courses=d.optJSONArray("courses"),times=s.optJSONArray("times");ArrayList<JSONObject> list=new ArrayList<>();for(int i=0;courses!=null&&i<courses.length();i++){JSONObject x=courses.getJSONObject(i);if(x.optInt("day")==today.getDayOfWeek().getValue()&&ReminderReceiver.hasWeek(x.optJSONArray("weeks"),week))list.add(x);}Collections.sort(list,(a,b)->Integer.compare(a.optInt("start"),b.optInt("start")));StringBuilder out=new StringBuilder("第"+week+"周 · "+today.getMonthValue()+"/"+today.getDayOfMonth()+"\n");if(list.isEmpty())out.append("今天没有课程，好好安排自己的时间。");for(int i=0;i<list.size()&&i<3;i++){JSONObject x=list.get(i);int sec=x.optInt("start")-1;String time=("school".equals(s.optString("timeSource"))||"manual".equals(s.optString("timeSource")))&&times!=null&&sec>=0&&sec<times.length()?times.getJSONObject(sec).optString("start"):"第"+(sec+1)+"节";out.append(time+" "+x.optString("name")+"\n"+x.optString("room")+"\n");}if(list.size()>3)out.append("还有 "+(list.size()-3)+" 门课 · 点击查看");text=out.toString();}catch(Exception ignored){}
  for(int id:ids){RemoteViews views=new RemoteViews(c.getPackageName(),R.layout.widget);views.setTextViewText(R.id.widget_content,text);views.setOnClickPendingIntent(R.id.widget_root,PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));manager.updateAppWidget(id,views);}
 }
}
