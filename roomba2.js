/*
******************************************************
* File:Roomba2.js
* Date:1/10/2013
* Version: 1.1
* Author: Alban Vidal-Naquet (alban@albanvn.net)
* Sarah plugin for Roomba vaccum cleaner
******************************************************
*/
/* TODO
	-Add dailies roomba task in plugin
*/
var loc=require("./customloc.js").init(__dirname);

const gs_roombauth="";
const gs_roombajson="roomba.json";
const gs_roombarwr="rwr.cgi?exec="
const gs_roombaxmlfilename="roomba2.xml";

var g_roombaStatus = {'alive' : 0, 'left' : 0, 'right' : 0, 'state' : 0, 'charge' : 0 };
var g_orderrwr="";
var g_debug=0;

exports.init = function (SARAH)
{
	var config = SARAH.ConfigManager.getConfig().modules.roomba2;
	updateXML(config);
	getStatus(config, "FULLSTATUS", SARAH);
	//doAuthent(config, 1, "", doAction, SARAH);
}

exports.action = function(data, callback, config, SARAH) 
{
  config = config.modules.roomba2;

  if (!config.ip_roomba) 
  {
	  console.log("Missing Roomba configuration");    
      SARAH.speak(loc.getLocalString("NOCONFIGURATION"));
	  return;
  }
  SARAH.speak(loc.getLocalString("OKLETSDOIT"));
  doAuthent(config, 0, data.mode, doAction, SARAH);
  callback();
}

var AddItem=function(place, index)
{
  if (typeof place==='undefined' || place=="")
    return "";
  return "			<item>" + place + "<tag>out.action.mode=\"" + index + "\";</tag></item>\n";
}

function updateXML(config)
{
  var xmlfile=__dirname + "/" + gs_roombaxmlfilename;
  var config_xml="";
  var fs   = require('fs');
  var xml  = fs.readFileSync(xmlfile,'utf8');
  var regexp = new RegExp('§[^§]+§','gm');
  i=1;
  config_xml="		<one-of>\n";
  config_xml+=AddItem(config.path1_name, i++);
  config_xml+=AddItem(config.path2_name, i++);
  config_xml+=AddItem(config.path3_name, i++);
  config_xml+=AddItem(config.path4_name, i++);
  config_xml+=AddItem(config.path5_name, i++);
  config_xml+="		</one-of>\n";
  xml = xml.replace(regexp, "§ -->\n" + config_xml + "<!-- §");
  fs.writeFileSync(xmlfile, xml, 'utf8');
}

function doAction(config, silent, mode, auth, SARAH)
{
  if (mode=="")
    return;
  if (mode=="FULLSTATUS" || mode=="SHORTSTATUS") 
     // Get Roomba status
	 doRoombaWakeUp(config, silent, mode, auth, SARAH, getStatus2);
  else
	 doRoombaWakeUp(config, silent, mode, auth, SARAH, runAction);
  return;
}

function runAction(config, silent, mode, auth, SARAH, callback)
{
  // Wait 4 seconds before send command
  var path="";
  setTimeout(function()
	{
		switch (mode)
		{
			case "DOCK":
				path="D00";
				break;
			case "SPOT":
				path="S00";
				break;
			case "CLEAN":
				path="C00";
				break;
			case "1":
			case "2":
			case "3":
			case "4":
			case "5":
				path=getPath(config, parseInt(mode));
				if (path=="")
				{
				  if (silent==0)
					SARAH.speak(loc.getLocalString("UNKNOWNPATH"));
				  return ;
				}
				break;
		}
		if (path!="")
		{
		  var cmd=TranslatePathToCmd(path);
		  ExecuteCmd(auth,cmd);
		}
	}, 4000);
	return;
}

var doRoombaWakeUp=function(config, silent, mode, auth, SARAH, callback)
{
  	// Send idle to wake up roomba
  	var request = require('request');
    request({ url : g_orderrwr+"1", headers : {"Authorization" : auth}}, 
	            function (err, response, body)
				{
					if (err || response.statusCode != 200) 
					{
						g_roombaStatus.alive=0;
						console.log("Error Roomba:"+response.statusCode);
						return;
					}
					if (body!="1")
					{
						if (silent==0)
							SARAH.speak(loc.getLocalString("CANNOTWAKEUP"));
						return ;
					}
					if (g_debug==1) 
						console.log("doAction Idle:"+body);
					return callback(config, silent, mode, auth, SARAH);
				});					
}

function doAuthent(config, silent, mode, cb, SARAH)
{
  var auth="";
  if (config.admin && config.password)
	auth = 'Basic ' + new Buffer(config.admin + ':' + config.password).toString('base64');
  if (config.ip_roomba)
	g_orderrwr="http://"+config.ip_roomba+"/"+gs_roombarwr;
  var request = require('request');
  url = 'http://' + config.ip_roomba + gs_roombauth;
  request({url : url, headers : {"Authorization" : auth}},
             function (err, response, body)
		     {
	  	       if (err || response.statusCode != 200) 
			   {
				 g_roombaStatus.alive=0;
			     console.log("Error Roomba:"+response.statusCode);
			     return;
		       }
			   if (g_debug==1) 
					console.log("doAuthent:"+body);
		       cb(config, silent, mode, auth, SARAH);
		     });  
  return;
}

// Function for portlet get status
var getStatus  = function(config, mode, SARAH)
{ 
  if (!config.ip_roomba) 
  {
    g_roombaStatus.alive=0;
    return g_roombaStatus;
  }
  // Do authent and wake up roomba
  doAuthent(config,1,mode,getStatus2,SARAH);
  return g_roombaStatus;
}

exports.getStatus  = getStatus;
  
// Function called by doAction and getStatus...Roomba is already waked up
var getStatus2 = function(config, silent, mode, auth, SARAH)
{  
  roombaStatusCheck(config, silent, mode, auth, SARAH);
  return g_roombaStatus;
}

function parseRoombaStatus(roombaRawStatus, silent, mode, SARAH) 
{
    var ttStatus="";
	if (roombaRawStatus == "error")
	{
	  ttsStatus=loc.getLocalString("NOCONNEXION");
	  g_roombaStatus.alive = 0;
	}
	else 
	{
	  var status = JSON.parse(roombaRawStatus);
	  var charge = Math.round(status.response.r18.value*100/status.response.r19.value);
	  g_roombaStatus.alive = 1;
	  g_roombaStatus.left = status.response.r8.value; 
	  g_roombaStatus.right = status.response.r9.value; 
	  g_roombaStatus.state =  loc.getLocalStringArray("ROOMBASTATE", status.response.r14.value);
	  g_roombaStatus.charge = charge;
	  loc.addDictEntry("LEFT", getDirtString(status.response.r8.value), 0);
	  loc.addDictEntry("RIGHT", getDirtString(status.response.r9.value), 0);
	  ttsStatus=loc.getLocalString("STATUSREPORT");
	  if (mode == "FULLSTATUS" )
	  {
		loc.addDictEntry("CHARGE", charge, 0);
		ttsStatus+=loc.getLocalString("STATUSREPORTEXTENDED");
	  }
	}
    if (silent==0 && ttsStatus!="") 
	  SARAH.speak(ttsStatus);
	return;
}

function roombaStatusCheck(config, silent, mode, auth, SARAH) 
{
  var request = require('request');
  var url= 'http://' + config.ip_roomba + '/' + gs_roombajson;
  request({ url : url,headers : {"Authorization" : auth}},
		  function (err, response, body)
		  {
    	       if (err || response.statusCode != 200) 
			   {
				 g_roombaStatus.alive=0;
    		     console.log("Roomba error:" +response.statusCode);
    		     return;
    	       }
			   if (g_debug==1) 
				console.log("roombaStatusCheck:"+body);
    	       parseRoombaStatus(body, silent, mode, SARAH);
          });
}

function getDirtString(value) 
{
  if (value == 0)                  {return loc.getLocalStringArray("ROOMBADIRT", 0);}
  if (value > 0 && value <= 85)    {return loc.getLocalStringArray("ROOMBADIRT", 1);}
  if (value > 85 && value <= 125)  {return loc.getLocalStringArray("ROOMBADIRT", 2);}
  if (value > 125 && value <= 170) {return loc.getLocalStringArray("ROOMBADIRT", 3);}
  if (value > 170)                 {return loc.getLocalStringArray("ROOMBADIRT", 4);}
}

///////////////////////////////////////////////
// TranslatePathToCmd function
// Syntax of Path:
// Path is a formated string with multiple '{OperationCode}{Argument}'
// Example:Path="a10d090a05g045r30S"
// For forward/backward action, in 1 seconds roomba moves about 1 meters 
// Syntax:
//   -go forward:   aXX,  XX is duration in seconds
//   -go backward:  rXX,  XX is duration in seconds
//   -rotate right: dXXX, XXX is angle in degree and only multiple of 15 and <=180
//   -rotate left:  gXXX, XXX is angle in degree and only multiple of 15 and <=180
//   -Dock mode:    DXX,  XX is duration in minutes, XX=00 means endless & last operation of command
//   -Spot mode:    SXX,  XX is duration in minutes, XX=00 means endless & last operation of command
//   -Clean mode:   CXX,  XX is duration in minutes, XX=00 means endless & last operation of command
///////////////////////////////////////////////
var TranslatePathToCmd=function(Path)
{
  var listcmd=new Array();
  var listtimer=new Array();
  // wake up roomba
  listcmd.push("1");
  listtimer.push(4);
  // Full mode
  listcmd.push("h");
  listtimer.push(4);
  for (i=0;i<Path.length;i++)
  {
    switch(Path.charAt(i))
	{
	   case 'S': // SPOT mode, syntax SXX, XX is duration in minutes
		 listcmd.push("5");
		 listtimer.push(parseInt(Path.substr(i+1,2))*60);
		 i+=2;
		 last="";
	     break;
	   case 'C': // CLEAN mode, syntax CXX, XX is duration in minutes
		 listcmd.push("4");
		 listtimer.push(parseInt(Path.substr(i+1,2))*60);
		 i+=2;
		 last="";
	     break;
	   case 'D': // DOCK mode, syntax DXX, XX is duration in minutes
		 listcmd.push("6");
		 listtimer.push(parseInt(Path.substr(i+1,2))*60);
		 i+=2;
		 last="";
	     break;
	   case 'a': // forward, syntax aXX, XX is duration in seconds
		 listcmd.push(last="a");
		 listtimer.push(parseInt(Path.substr(i+1,2)));
		 // then stop
		 listcmd.push("a");
		 listtimer.push(1);
		 i+=2;
	     break;
	   case 'r': // backward, syntax rXX, XX is duration in seconds
		 listcmd.push(last="l");
		 listtimer.push(parseInt(Path.substr(i+1,2)));
		 // then stop
		 listcmd.push("l");
		 listtimer.push(1);
		 i+=2;
	     break;
	   case 'd': // right, syntax dXXX, XXX is angle in degree mutliple of 15
		 var c=getCommandR(parseInt(Path.substr(i+1,3)));
		 for (j=0;j<c.length;j++)
		 {
		   listcmd.push(c.charAt(j)+"");
		   listtimer.push(3);
		 }
		 i+=3;
		 last="";
	     break;
	   case 'g': // left, syntax gXXX, XXX is angle in degree mutliple of 15
		 var c=getCommandG(parseInt(Path.substr(i+1,3)));
		 for (j=0;j<c.length;j++)
		 {
		   listcmd.push(c.charAt(j)+"");
		   listtimer.push(3);
		 }
		 i+=3;
		 last="";
	     break;
		default:
		  console.log("Unknown path at position "+i+":'"+Path.charAt(i)+"'");
	}
  }
  if (last!="")
  {
    // Add last command to stop action
    listcmd.push(last);
    listtimer.push(0);
  }
  var cmd = {};
  cmd.listcmd=listcmd;
  cmd.listtimer=listtimer;
  return cmd;
}

var getCommandR=function(degre)
{
	var c="";
	switch(degre)
	{
		case 15: c="e"; break;
		case 30: c="ee"; break;
		case 45: c="f"; break;
		case 60: c="fe"; break;
		case 75: c="fee"; break;
		case 90: c="g"; break;
		case 105: c="ge"; break;
		case 120: c="gee"; break;
		case 135: c="gf"; break;
		case 150: c="gfe"; break;
		case 165: c="gfee"; break;
		case 180: c="gg"; break;
		default:
		 console.log("error in rotation: "+degre+" (must be a multiple of 15)");
		 break;
	}
	return c;
}
var getCommandG=function(degre)
{
	var c="";
	switch(degre)
	{
		case 15: c="b"; break;
		case 30: c="bb"; break;
		case 45: c="c"; break;
		case 60: c="cb"; break;
		case 75: c="cbb"; break;
		case 90: c="d"; break;
		case 105: c="db"; break;
		case 120: c="dbb"; break;
		case 135: c="dc"; break;
		case 150: c="dcb"; break;
		case 165: c="dcbb"; break;
		case 180: c="dd"; break;
		default:
		 console.log("error in rotation: "+degre+" (must be a multiple of 15)");
		 break;
	}
	return c;
}

var getPath=function(config, index)
{
  switch(index)
  {
    case 1:
	  return config.path1_cmd;
      break;
	case 2:
	  return config.path2_cmd;
	  break;
	case 3:
	  return config.path3_cmd;
	  break;
    case 4:
	  return config.path4_cmd;
      break;
    case 5:
	  return config.path5_cmd;
      break;
  }
}

function ExecuteCmd(auth,cmd)
{
  cmd.step=0;
  setTimeout(function Exec()
			{
				var request = require('request');
				var url=g_orderrwr+cmd.listcmd[cmd.step];
				
				if (g_debug==1) 
					console.log(url+" during "+cmd.listtimer[cmd.step]);
				request({url : url,	headers : {"Authorization" : auth}},
					  function (err, response, body)
					  {
						   if (err || response.statusCode != 200 || body!="1") 
						   {
							 g_roombaStatus.alive=0;
							 console.log("Roomba error:" +response.statusCode);
							 return;
						   }
						   if (g_debug==1) 
							console.log("ExecuteCmd: "+body);
						   if ((cmd.step)<cmd.listcmd.length && cmd.listtimer[cmd.step]>0) 
							 setTimeout(Exec, cmd.listtimer[cmd.step++]*1000); 
					  });
			}
            ,100);
}

