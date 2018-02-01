require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
import React from './ReactFake';

import Details from './Details'
import Util from './Util'

export default class Image extends Details {
    constructor(itemid, item) {
        /*
        Construct an Image object before rendering it to a HTML page
        item = metadata from a metadata fetch
         */
        super(itemid, item);
        this.itemtype = "http://schema.org/VisualArtwork";
    }
    archive_setup_push() {
        AJS.theatresize();
        AJS.carouselsize('#ia-carousel', true);
        super.archive_setup_push(); // On eample images the theatre & carosel came before the parts common to AV, Image and Text
    }

    theatreIaWrap() {
        let item = this.item;
        let itemid = item.metadata.identifier; // Shortcut as used a lot
        let mainArchiveFile = this._list.find((fi) => Util.imageFormats.includes(fi.metadata.format)); // Can be undefined if none included
        let detailsURL = `https://archive.org/details/${itemid}`; //This is probably correct to remain pointed at archive.org since used as an itemprop
        let embedurl = `https://archive.org/embed/${itemid}`; //This is probably correct to remain pointed at archive.org since passed to social media
        return (
            <div id="theatre-ia-wrap" className="container container-ia width-max  resized" style={{height: "600px"}}>
                <link itemProp="url" href={detailsURL}/>

                <link itemProp="thumbnailUrl" href="https://archive.org/services/img/{itemid}"/>{/*TODO-DETAILS-ONLINE is there a better thumbnail*/}

                { item.files.filter((fi)=> fi.source !== "metadata").map((fi) => ( //TODO-DETAILS-LIST Maybe use _list instead of .files
                    <link itemProp="associatedMedia" href={`https://archive.org/download/${itemid}/${fi.name}`} key={`${itemid}/${fi.name}`}/>
                )) }

                <h1 className="sr-only">{item.metadata.title}</h1>
                <h2 className="sr-only">Item Preview</h2>

                <div id="theatre-ia" className="container">
                    <div className="row">
                        <div className="xs-col-12">

                            <div id="theatre-controls">
                            </div> {/*#theatre-controls*/}

                { mainArchiveFile ? (
                            <div className="details-carousel-wrapper">
                                <section id="ia-carousel" className="carousel slide" data-ride="carousel" data-interval="false"
                                         aria-label="Item image slideshow" style={{maxHeight: "600px"}}>
                                    <ol className="carousel-indicators" style={{display:"none"}}>
                                        <li data-target="#ia-carousel" data-slide-to="0" className=" active" role="button" tabIndex="0"
                                            aria-label="Go to image 1"></li>
                                    </ol>

                                    <div className="carousel-inner">
                                        <div className="item active">
                                            <a className="carousel-image-wrapper"
                                               href={`https://archive.org/download/${itemid}/${mainArchiveFile.metadata.name}`}
                                               title="Open full sized image" target="_blank">{/*--Separate window so dont break Dweb--*/}
                                                    <div id="streamContainer" src={mainArchiveFile} className="rot0 carousel-image" alt="item image #1"/> {/*--Note this div not img to work around ffox bug, see ArchiveFile.loadImg--*/}
                                            </a>
                                            <div className="carousel-caption">
                                                {mainArchiveFile.metadata.name}
                                            </div>
                                        </div>
                                    </div>

                                </section>

                            </div>
                ) : (
                            <div className="row" style={{color:"white"}}>
                                <div className="col-md-10 col-md-offset-1 no-preview">
                                    <p className="theatre-title">There Is No Preview Available For This Item</p>
                                    <p>
                                        This item does not appear to have any files that can be experienced on Archive.org
                                        <br/><span className="hidden-xs hidden-sm">Please download files in this item to interact with them on your computer.</span><br/>
                                        <a className="show-all" href={`https://archive.org/download/${itemid}`} target="_blank">Show all files</a>{/*TODO-DETAILS-FILE should handle download of collection*/}
                                    </p>
                                </div>
                            </div>
                ) }
                            {/* Script tags moved into the JS*/}
                            <div id="webtorrentStats" style="color: white; text-align: center;"></div>
                            {this.cherModal("audio")}
                        </div>{/*--/.xs-col-12*/}
                    </div>{/*--/.row*/}

                </div>{/*--#theatre-ia*/}
                <div id="flag-overlay" className="center-area ">
                </div>
            </div>
            )
    };

}
