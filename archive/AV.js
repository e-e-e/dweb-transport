require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
import React from './ReactFake';
import Util from "./Util";

import Details from './Details';
import RenderMedia from 'render-media';
import throttle from 'throttleit'
import prettierBytes from 'prettier-bytes'

export default class AV extends Details {
    constructor(itemid, item) {
        super(itemid, item);
    }

    archive_setup_push() {
        let self = this;
        super.archive_setup_push(); // On commute.html the Play came after the parts common to AV, Image and Text
        // archive_setup.push(function() { //TODO-ARCHIVE_SETUP move Play from browserAfter to here
        //    Play('jw6', self.playlist, self.cfg);
        // });

    }
    setupPlaylist(preferredTypes) {
        this.playlist=[];
        this.avs = this._list.filter(fi => (preferredTypes.includes(fi.metadata.format)));
        if (this.avs.length) {
            this.avs.sort((a, b) => Util.natcompare(a.metadata.name, b.metadata.name));   //Unsure why sorting names, presumably tracks are named alphabetically ?

            this.playlist.push({ name: this.avs[0].name,
                urls: [item.metadata.magnetlink + '/' + this.avs[0].name] })
        }
    }
}

export class Video extends AV {
    constructor(itemid, item) {
        super(itemid, item);
        this.itemtype = "http://schema.org/VideoObject";
    }
    setupPlaylist() {
        super.setupPlaylist(['h.264','512Kb MPEG4'])
    }

    theatreIaWrap() {
        let item = this.item;
        let itemid = this.itemid;
        let detailsurl = `https://archive.org/details/${itemid}`
        let title = item.title
        //let cfg  = {"aspectratio": 4/3 }; // Old version in Traceys code which was missign other parts of cfg below
        let cfg =    {"start":0,"embed":null,"so":false,"autoplay":false,"width":0,"height":0,"list_height":0,"audio":false,
            "responsive":true,"flash":false, "hide_list":true,
            "identifier": this.itemid, //TODO-DETAILS-ONLINE check another example and see if identifier should be itemid or title
            "collection": this.item.metadata.collection[0],
        };
        /*
        [{"title":"commute","orig":"commute.avi","image":"/download/commute/commute.thumbs%2Fcommute_000005.jpg",
            "duration":"115.61",
            "sources":[
                {"file":"/download/commute/commute.mp4","type":"mp4","height":"480", "width":"640","label":"480p"},
                {"file":"/download/commute/commute.ogv","type":"ogg","height":"304","width":"400","label":"304p"}],
            "tracks":[{"file":"https://archive.org/stream/commute/commute.thumbs/commute_000005.jpg&vtt=vtt.vtt","kind":"thumbnails"}]}],
        */
        this.setupPlaylist();

        //TODO-DETAILS make next few lines between theatre-ia-wrap and theatre-ia not commute specific
        return (
            <div id="theatre-ia-wrap" class="container container-ia width-max ">
                <link itemprop="url" href={detailsurl}/>
                {/*-- TODO make commute specific - look for somewhere else it builds itemprop
                <link itemprop="thumbnailUrl" href="https://archive.org/download/commute/commute.thumbs/commute_000005.jpg">
                <link itemprop="contentUrl" href="https://archive.org/download/commute/commute.mp4">
                <link itemprop="embedUrl" href="https://archive.org/embed/commute/commute.avi">
                 <meta itemprop="duration" content="PT0M115S">
                 --*/}
                <h1 class="sr-only">{title}</h1>
                <h2 class="sr-only">Movies Preview</h2>

                <div id="theatre-ia" class="container">
                    <div class="row">
                        <div class="xs-col-12">

                            <div id="theatre-controls">
                                <a href="#" id="gofullscreen" onclick="">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-fullscreen"
                                         title="fullscreen view"></div>
                                </a>
                                <a href="#" onclick="return AJS.flash_click(0)">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-flash"
                                         title="Click to have player try flash first, then HTML5 second"></div>
                                </a>
                                <a href="#" onclick="return AJS.mute_click()">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-unmute"
                                         title="sound is on.  click to mute sound."></div>
                                </a>
                                <a href="#" onclick="return AJS.mute_click()">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-mute"
                                         style="display:none" title="sound is off.  click for sound."></div>
                                </a>
                            </div>{/*--/#theatre-controls--*/}
                            <noscript>
                                <div class="alert alert-danger alert-dismissable" data-dismiss="alert">
                                    <button type="button" class="close" data-dismiss="alert" aria-hidden="true"><span
                                            class="iconochive-remove-circle" aria-hidden="true"></span><span class="sr-only">remove-circle</span>
                                    </button>
                                    Internet Archive&apos;s in-browser
                                    video player requires JavaScript to be enabled.
                                    It appears your browser does not have it turned on.
                                    Please see your browser settings for this feature.
                                </div>
                            </noscript>

                            <div id="videoContainerX" style="text-align: center;">
                                <video id="streamContainer" src={this.avs[0]}></video>
                            </div>
                            <div id="webtorrentStats" style="color: white; text-align: center;"></div>
                            {this.cherModal("video")}
                        </div> {/*--/.xs-col-12--*/}
                    </div>{/*--/.row--*/}
                </div>
                <div id="flag-overlay" class="center-area ">
                </div>
            {/*--//.container-ia--*/}</div>
        );
    }
}
export class Audio extends AV {
    constructor(itemid, item) {
        super(itemid, item);
        this.itemtype = "http://schema.org/AudioObject";
    }

    setupPlaylist() {
        super.setupPlaylist(['VBR MP4',"Ogg Vorbis"]);   //TODO-AUDIO this is only going to play first track
    }

    theatreIaWrap() {
        let item = this.item;
        let itemid = this.itemid;
        let detailsurl = `https://archive.org/details/${itemid}`
        let title = item.title
        let imgurl = `https://archive.org/services/img/${itemid}`
        return (
            <div id="theatre-ia-wrap" class="container container-ia width-max ">
                <link itemprop="url" href={detailsurl}/>
                <link itemprop="image" href={imgurl}/>

                {/* TODO-AUDIO Loop over tracks - has ogg and mp3 tracks here */}
                {/*Example
                <div itemprop="hasPart" itemscope itemtype="http://schema.org/AudioObject">
                    <meta itemprop="name" content="105 www.quranaudio.info - Abdulrahman Alsudaes">
                    <meta itemprop="duration" content="PT0M20S">

                    <link itemprop="associatedMedia"
                          href="https://archive.org/download/AbdulAzizSurahFateha/105Www.quranaudio.info.ogg">
                    <link itemprop="associatedMedia"
                          href="https://archive.org/download/AbdulAzizSurahFateha/105Www.quranaudio.info.mp3">
                </div>
                */}

                <h1 class="sr-only">{title}</h1>
                <h2 class="sr-only">Audio Preview</h2>

                <div id="theatre-ia" class="container">
                    <div class="row">
                        <div class="xs-col-12">

                            <div id="theatre-controls">
                                <a href="#" onclick="return AJS.flash_click(0)">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-flash"
                                         title="Click to have player try flash first, then HTML5 second"></div>
                                </a>
                                <a href="#" onclick="return AJS.mute_click()">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-unmute"
                                         title="sound is on.  click to mute sound."></div>
                                </a>
                                <a href="#" onclick="return AJS.mute_click()">
                                    <div data-toggle="tooltip" data-container="body" data-placement="left" class="iconochive-mute"
                                         style="display:none" title="sound is off.  click for sound."></div>
                                </a>
                            </div>{/*--/#theatre-controls--*/}


                            <noscript>
                                <div class="alert alert-danger alert-dismissable" data-dismiss="alert">
                                    <button type="button" class="close" data-dismiss="alert" aria-hidden="true"><span
                                            class="iconochive-remove-circle" aria-hidden="true"></span><span class="sr-only">remove-circle</span>
                                    </button>
                                    Internet Archive&apos;s in-browser
                                    audio player requires JavaScript to be enabled.
                                    It appears your browser does not have it turned on.
                                    Please see your browser settings for this feature.
                                </div>
                            </noscript>

                            <div id="audioContainerX" style="text-align: center;">
                                <audio id="streamContainer" src={this.avs[0]}></audio>
                            </div>
                            <div id="webtorrentStats" style="color: white; text-align: center;"></div>
                            {this.cherModal("audio")}

                        </div>{/*--/.xs-col-12--*/}
                    </div>{/*--/.row--*/}

                </div>{/*--//#theatre-ia--*/}
                <div id="flag-overlay" class="center-area ">
                </div>
            {/*--//.container-ia--*/}</div>
        );
    }
}
