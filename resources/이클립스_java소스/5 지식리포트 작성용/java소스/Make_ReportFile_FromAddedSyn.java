package dicwork;

import java.io.*;
import java.util.ArrayList;
//import java.util.Arrays;
import java.util.Properties;

/*
 * addedsyn 파일의 유사어 일부추가 정보를 보고서용으로 분리 
 * change.txt 에는 부분유사어로 체크되었으나 실제로는 전체 추가되는 내용이 기재됨.
 */

public class Make_ReportFile_FromAddedSyn {
	
	
	public static void main(String args[]) {

		try {
      
			//String workdir = "D:/work_tmp/common_log";
			String configFilePath = "know_work_init.txt"; // 
			
		    // 설정 파일 로드
            Properties properties = new Properties();
            try (FileReader reader = new FileReader(configFilePath)) {
                properties.load(reader);
            }

            // 저장 경로 가져오기
            String workDirectory = properties.getProperty("work_directory");
            if (workDirectory == null || workDirectory.trim().isEmpty()) {
                throw new IllegalArgumentException("work_directory 설정이 필요합니다.");
            }
			       
            String workdir = workDirectory + "/common_log";

			
			String inputfile = workdir + "/synadd.txt" ;
			String outputfileNew = workdir + "/newkwd_B.txt" ;
			String outputfilePre = workdir + "/prekwd_A.txt" ;
			String outputfileCw = workdir + "/change.txt" ;
    	
			BufferedReader in = new BufferedReader(new FileReader(inputfile));
			BufferedWriter outNew = new BufferedWriter(new FileWriter(outputfileNew)); 
			BufferedWriter outPre = new BufferedWriter(new FileWriter(outputfilePre));
			BufferedWriter outCw = new BufferedWriter(new FileWriter(outputfileCw));
			
			ArrayList<String> kwdList = new ArrayList<String> ();

			String s;

			String[] divSs ;
			String[] divSt ;
			String[] divSv ;
		
			String tmpA;
			String tmpB;
			
			String dupstarttarget = "<<<<";
			String starttarget = "<<";
			String endtarget = ">>";
			String dupendtarget = ">>>>";
			
			String tmpT, tmpAt, tmpBt;
			
			String str;
			String result;
			String tmpresult;
			String kwdinfo ;
			int starttarget_num;
			int endtarget_num;
			
			boolean b ;

			int tmpendidx;
			int tmpstartidx;
			
			int newkwdcnt;
			int addcnt = 0;
			int linecnt = 0;
			
			int fstopenidx;
			int sndopenidx;
			int trdopenidx;
			int fstendidx;
			int sndendidx;
			int trdendidx;
			String newstr1;
			String newstr2;
			String newstr3;
			String newstr4;
			String result1;
			String result2;
			
			int prepaircnt ;
			int chkcnt =0;

			String sDSp = " ";
			
			while ((s = in.readLine()) != null) {
				if(s == null || s.length() == 0) {continue;}
				if (s.contains("======")) {
					continue;
				}
				
				divSs = s.split(" ");
				tmpT = "";
				tmpA = "";
				tmpB = "";
				tmpAt = "";
				tmpBt = "";
				
				newkwdcnt = 0;
				
				//orgpaircnt = divSs.length;
				
				// debug
				//outW.write(s + "\n");
				// 정렬을 해도 "<<" 보다 숫자로 시작되는 키워드는 앞으로... meaning쪽 적용..
				//Arrays.sort(divSs);
				
				// addedsyn 파일의 신규키워드 추출 오류 문제 해결하기 위함.
				// << 있는 키워드를 앞으로 처리
				// 나중에 처리할 때 중복되는 것은 skip
				for (String tmpWA : divSs) {
					b = tmpWA.contains(starttarget);
					if (b == true) {
						tmpA = tmpA + sDSp + tmpWA ;
						newkwdcnt = newkwdcnt +1;	
					} else {
						tmpB = tmpB + sDSp + tmpWA;
					}
				}
				
				//  키워드 정렬
				tmpA = tmpA.trim();
				//divTa = tmpA.split(" ");
				//Arrays.sort(divTa);
							
				tmpB = tmpB.trim();
				//divTb = tmpB.split(" ");
				//Arrays.sort(divTb);
				tmpT = tmpA + sDSp + tmpB;
								
				// 레포트용 파일만들기			
				result = "";
				
				divSt = tmpT.split(" ");
				//checkcnt = divSt.length;		
				
				linecnt = linecnt +1;
				
				for (String tmpS : divSt) {

					if (tmpS.contains(dupstarttarget)&&tmpS.contains(dupendtarget)) {
						// 3개 키워드 중복인 경우 <<AA<<<<BB>>CC>>>> BB, BBCC,AABBCC
						// <<<<AA<<BB>>>>CC>> AABBCC , AABB, BB
						
						str = tmpS;
						
						starttarget_num = str.indexOf(starttarget);
						endtarget_num = str.lastIndexOf(endtarget);

						// open_tag
						trdopenidx = str.lastIndexOf(starttarget);

						newstr1 = str.substring(0,trdopenidx);
						sndopenidx = newstr1.lastIndexOf(starttarget);

						newstr2 = str.substring(0,sndopenidx);
						fstopenidx = newstr2.indexOf(starttarget);
						
						
						// eng_tag
						trdendidx = str.lastIndexOf(endtarget);

						newstr3 = str.substring(0,trdendidx);
						sndendidx = newstr3.lastIndexOf(endtarget);

						newstr4 = str.substring(0,sndendidx);
						fstendidx = newstr4.lastIndexOf(endtarget);
						
											
						// 1th keyword
						result1 = str.substring(trdopenidx+2,fstendidx);
						result2 = result1.replaceAll("<","");
						result = result2.replaceAll(">","");
																		
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;
						
						// 2nd keyword
						result1 = str.substring(sndopenidx+2,sndendidx);
						result2 = result1.replaceAll("<","");
						result = result2.replaceAll(">","");
						
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;
						

						// 3rd keyword
						result1 = str.substring(fstopenidx+2,trdendidx);
						result2 = result1.replaceAll("<","");
						result = result2.replaceAll(">","");

						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;
						
						
					} else if (tmpS.contains(dupstarttarget)) {							

						// 2개 키워드 중복. <<<<AA>>BB>>
						str = tmpS;
						starttarget_num = str.indexOf(starttarget);
						endtarget_num = str.indexOf(endtarget);

						result = str.substring(starttarget_num+4,endtarget_num);

						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;

						// 2번째 키워드
						result = str.substring(starttarget_num+4,endtarget_num) + str.substring(endtarget_num+2,str.length());
						result = result.substring(0,result.indexOf(endtarget)) ;
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;

					} else if (tmpS.contains(dupendtarget)) {
						// 2개 키워드 중복 <<AA<<BB>>>>

						str = tmpS;
						starttarget_num = str.indexOf(starttarget);
						endtarget_num = str.indexOf(endtarget);
						
						// AA<<BB
						tmpresult = str.substring(starttarget_num+2,endtarget_num);
						tmpstartidx = tmpresult.indexOf(starttarget);
						endtarget_num = tmpresult.length();

						// <<BB
						result = tmpresult.substring(tmpstartidx+2,endtarget_num);
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;
						
						// 2번째 키워드
						// AA<<BB
						result = tmpresult.substring(0,tmpstartidx)+ tmpresult.substring(tmpstartidx+2,endtarget_num);
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);

						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;
						
					} else if (tmpS.contains(starttarget)) {
						str = tmpS;
						starttarget_num = str.indexOf(starttarget);
						endtarget_num = str.indexOf(endtarget);
						tmpendidx = endtarget_num + 2;

						result = str.substring(starttarget_num+2,endtarget_num);
						kwdinfo = result.trim();
						kwdList.add(kwdinfo);
						
						tmpAt = tmpAt + sDSp + kwdinfo;
						addcnt = addcnt +1;

						// 키워드 추출이 잘못된 경우임. 이 키워드는 추가된 키워드가 아님
						if (tmpendidx != str.length()) {
							result = result + str.substring(tmpendidx,str.length());
							kwdinfo = result.trim();
							kwdList.add(kwdinfo);
							
							tmpBt = tmpBt + sDSp + kwdinfo;
						}

					} else {
						if (kwdList.contains(tmpS)){
							// addedsyn에서 잘못 추출되어 앞에 키워드 추가 부분에서 처리된 경우임.
							// DEBUG
						} else {
							kwdinfo = tmpS.trim();
							if (kwdinfo.equals("")) { continue; }
							kwdList.add(kwdinfo);
							
							tmpBt = tmpBt + sDSp + kwdinfo;
						}								
					}
				}	
					
				tmpAt = tmpAt.trim();
				tmpBt = tmpBt.trim();
				
				
				divSv = tmpBt.split(" ");
				prepaircnt = divSv.length;
				
				if (prepaircnt <= 1) {
					chkcnt = chkcnt+1;
					//System.out.println(tmpBt);
					outCw.write(tmpBt + " " + tmpAt);
					outCw.newLine();
					
				} else { 

					//System.out.println(tmpAt);
					//System.out.println(tmpBt);
					//System.out.println("\n ================");
					outNew.write(tmpAt); 
					outPre.write(tmpBt);
					outNew.newLine();
					outPre.newLine();
				}

				kwdList.clear();

			}
			
			outNew.close();
			outPre.close();
			outCw.close();
			in.close();
			
			System.out.println("================");
			System.out.println("라인수 : " + linecnt);
			System.out.println("추가키워드수 : " + addcnt);
			System.out.println("기존유사어-1개 : " + chkcnt);
			System.out.println("================");
			System.out.println("파일생성 끝!!!");
		////////////////////////////////////////////////////////////////
		} catch (IOException e) {
			System.err.println(e); // error
			System.exit(1);
		}

	}
}